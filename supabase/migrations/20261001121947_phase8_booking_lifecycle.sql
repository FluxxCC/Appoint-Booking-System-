-- Phase 8: approval policy, atomic slot acquisition and auditable lifecycle.
-- The existing exclusion constraint remains the final concurrency authority.

alter table public.appointments
  add column acceptance_source text not null default 'MANUAL'
  constraint appointments_acceptance_source_value check (acceptance_source in ('MANUAL','AUTO'));

alter table public.appointments drop constraint appointments_check3;
alter table public.appointments add constraint appointments_acceptance_evidence check (
  (accepted_at is null and accepted_by is null and acceptance_source = 'MANUAL')
  or (accepted_at is not null and (
    (acceptance_source = 'MANUAL' and accepted_by is not null)
    or (acceptance_source = 'AUTO' and accepted_by is null)
  ))
);
alter table public.appointments add constraint appointments_active_acceptance check (
  state not in ('ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW','PAYMENT_EXPIRED')
  or accepted_at is not null
);

create or replace function private.guard_appointment() returns trigger
language plpgsql set search_path = '' as $$
declare allowed boolean := false; paid bigint;
begin
 new.occupied_range := tstzrange(new.starts_at - make_interval(mins => new.buffer_before_minutes),
   new.ends_at + make_interval(mins => new.buffer_after_minutes), '[)');
 if tg_op = 'INSERT' then
   if new.state <> 'PENDING' or new.accepted_at is not null or new.accepted_by is not null
      or new.payment_due_at is not null or new.acceptance_source <> 'MANUAL' then
     raise exception 'New appointments must be pending and unpaid';
   end if;
   return new;
 end if;
 if (new.customer_id,new.staff_id,new.policy_version_id,new.request_key,new.starts_at,new.ends_at,
     new.buffer_before_minutes,new.buffer_after_minutes,new.currency,new.total_amount,
     new.payment_mode_snapshot,new.required_payment_amount)
 is distinct from
    (old.customer_id,old.staff_id,old.policy_version_id,old.request_key,old.starts_at,old.ends_at,
     old.buffer_before_minutes,old.buffer_after_minutes,old.currency,old.total_amount,
     old.payment_mode_snapshot,old.required_payment_amount)
 then raise exception 'Booking snapshots and intervals are immutable; rescheduling requires a dedicated command'; end if;
 if old.accepted_at is not null and
    (new.accepted_at,new.accepted_by,new.acceptance_source) is distinct from
    (old.accepted_at,old.accepted_by,old.acceptance_source)
 then raise exception 'Acceptance evidence is immutable'; end if;
 if old.payment_due_at is not null and new.payment_due_at is distinct from old.payment_due_at
 then raise exception 'Payment deadline is immutable'; end if;
 if new.state = old.state then return new; end if;
 allowed := case old.state
 when 'PENDING' then new.state in ('ACCEPTED','DECLINED','CANCELLED')
 when 'ACCEPTED' then (new.state = 'CONFIRMED' and new.payment_mode_snapshot = 'PAY_AT_BUSINESS')
   or (new.state = 'AWAITING_PAYMENT' and new.payment_mode_snapshot <> 'PAY_AT_BUSINESS')
 when 'AWAITING_PAYMENT' then new.state in ('CONFIRMED','PAYMENT_EXPIRED','CANCELLED')
 when 'CONFIRMED' then new.state in ('CHECKED_IN','CANCELLED','NO_SHOW')
 when 'CHECKED_IN' then new.state = 'IN_PROGRESS'
 when 'IN_PROGRESS' then new.state = 'COMPLETED'
 else false end;
 if not allowed then raise exception 'Invalid appointment transition: % -> %',old.state,new.state; end if;
 if new.state = 'ACCEPTED' then
   if new.acceptance_source = 'AUTO' then
     if pg_trigger_depth() < 2 or
        not exists(select 1 from public.business_settings where booking_approval_mode = 'AUTO_CONFIRM')
     then raise exception 'Automatic acceptance requires the booking workflow'; end if;
   elsif auth.uid() is null or new.accepted_by <> auth.uid() or not
     (private.is_admin() or (exists(select 1 from public.business_settings
       where booking_approval_mode = 'STAFF_APPROVAL') and private.is_assigned_staff(new.staff_id)))
   then raise exception 'Authorized staff acceptance required'; end if;
 end if;
 if new.state = 'CONFIRMED' and old.state = 'AWAITING_PAYMENT' then
   if clock_timestamp() >= old.payment_due_at then raise exception 'Payment reservation expired'; end if;
   select coalesce(sum(amount),0) into paid from public.payments where appointment_id = new.id and state = 'SUCCEEDED'
     and currency = new.currency and paid_at < old.payment_due_at and exception_reason is null;
   if paid < new.required_payment_amount then raise exception 'Verified payment required'; end if;
 end if;
 if new.state = 'PAYMENT_EXPIRED' and clock_timestamp() < old.payment_due_at
 then raise exception 'Reservation has not expired'; end if;
 return new;
end; $$;

-- One transaction owns revalidation, reservation, state changes and event writes.
create function private.acquire_appointment(p_appointment uuid, p_automatic boolean)
returns public.appointment_state language plpgsql security definer set search_path = '' as $$
declare a public.appointments; i public.appointment_items; pol public.booking_policy_versions;
  b public.business_settings; v_mode text; next_state public.appointment_state;
  accepted_time timestamptz; due_time timestamptz; local_start timestamp;
begin
 perform private.lock_schedule();
 perform private.expire_due_payments();
 select * into a from public.appointments where id = p_appointment for update;
 if not found then raise exception 'Appointment unavailable' using errcode = 'P0002'; end if;
 select * into b from public.business_settings limit 1;
 v_mode := coalesce(b.booking_approval_mode,'ADMIN_APPROVAL');
 if p_automatic then
   if v_mode <> 'AUTO_CONFIRM' or pg_trigger_depth() < 1 then
     raise exception 'Automatic acceptance requires the booking workflow' using errcode = '42501';
   end if;
 elsif not (private.is_admin() or
   (v_mode = 'STAFF_APPROVAL' and private.is_assigned_staff(a.staff_id))) then
   raise exception 'Approval is not authorized for this booking' using errcode = '42501';
 end if;
 if a.state <> 'PENDING' then
   if not p_automatic and a.state in ('CONFIRMED','AWAITING_PAYMENT') then return a.state; end if;
   raise exception 'Only pending requests can be accepted' using errcode = '22023';
 end if;
 select * into pol from public.booking_policy_versions where id = a.policy_version_id;
 select * into i from public.appointment_items where appointment_id = a.id;
 if pol.id is null or i.id is null or b.id is null then raise exception 'Booking configuration is incomplete'; end if;
 if a.starts_at < clock_timestamp() + make_interval(mins => pol.minimum_notice_minutes)
    or a.starts_at > clock_timestamp() + make_interval(days => pol.maximum_advance_days)
 then raise exception 'Booking window has closed' using errcode = '22023'; end if;
 if a.ends_at <> a.starts_at + make_interval(mins => i.duration_minutes)
    or a.buffer_before_minutes <> i.buffer_before_minutes
    or a.buffer_after_minutes <> i.buffer_after_minutes
    or a.total_amount <> i.price_amount
 then raise exception 'Booking snapshot is inconsistent'; end if;
 if not exists(select 1 from public.services s join public.staff_services ss on ss.service_id = s.id
    join public.staff st on st.id = ss.staff_id
    where s.id = i.service_id and ss.staff_id = a.staff_id and s.active and ss.active
      and st.active and st.bookable and st.published
      and (s.category_id is null or exists(select 1 from public.service_categories c
        where c.id = s.category_id and c.active)))
 then raise exception 'Staff or service is no longer available' using errcode = '22023'; end if;
 local_start := a.starts_at at time zone b.timezone;
 if not exists(select 1 from public.business_hours h
    where h.weekday = extract(dow from local_start)::integer
      and h.opens_at <= local_start::time and h.closes_at > local_start::time
      and mod(extract(epoch from (local_start::time - h.opens_at))::integer,
              b.scheduling_interval_minutes * 60) = 0)
    or not private.valid_business_local_time(local_start,b.timezone)
 then raise exception 'Requested time is no longer on the schedule' using errcode = '22023'; end if;
 perform private.validate_schedule(a.staff_id,lower(a.occupied_range),upper(a.occupied_range));
 if exists(select 1 from public.appointments x where x.id <> a.id and x.staff_id = a.staff_id
   and x.occupied_range && a.occupied_range
   and x.state in ('ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW'))
 then raise exception 'This time is no longer available' using errcode = '23P01'; end if;
 accepted_time := clock_timestamp();
 update public.appointments set state = 'ACCEPTED', accepted_at = accepted_time,
   accepted_by = case when p_automatic then null else auth.uid() end,
   acceptance_source = case when p_automatic then 'AUTO' else 'MANUAL' end
 where id = a.id;
 if a.payment_mode_snapshot = 'PAY_AT_BUSINESS' then
   next_state := 'CONFIRMED';
   update public.appointments set state = next_state where id = a.id;
 else
   due_time := least(accepted_time + make_interval(mins => pol.payment_window_minutes),a.starts_at);
   if due_time <= accepted_time then raise exception 'Payment window has closed' using errcode = '22023'; end if;
   next_state := 'AWAITING_PAYMENT';
   update public.appointments set state = next_state,payment_due_at = due_time where id = a.id;
 end if;
 return next_state;
end; $$;
revoke all on function private.acquire_appointment(uuid,boolean) from public,anon,authenticated,service_role;

create or replace function private.accept_appointment(p_appointment uuid)
returns public.appointment_state language plpgsql security definer set search_path = '' as $$
begin
 return private.acquire_appointment(p_appointment,false);
end; $$;

-- The item is inserted by the established request operation. This trigger
-- ensures every request path, including registered users, shares acquisition.
create function private.auto_acquire_requested_appointment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if exists(select 1 from public.business_settings where booking_approval_mode = 'AUTO_CONFIRM') then
   perform private.acquire_appointment(new.appointment_id,true);
 end if;
 return new;
end; $$;
revoke all on function private.auto_acquire_requested_appointment() from public,anon,authenticated,service_role;
create trigger auto_acquire_requested_appointment after insert on public.appointment_items
for each row execute function private.auto_acquire_requested_appointment();

create or replace function private.transition_appointment(p_appointment uuid,p_target public.appointment_state,p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.appointments; pol public.booking_policy_versions; manager boolean;
  approval_mode text;
begin
 if auth.uid() is null or not private.is_active_user() then raise exception 'Authentication required' using errcode = '42501'; end if;
 perform private.lock_schedule();
 select * into a from public.appointments where id = p_appointment for update;
 if not found then raise exception 'Appointment unavailable' using errcode = 'P0002'; end if;
 select booking_approval_mode into approval_mode from public.business_settings limit 1;
 manager := private.is_admin() or
   (approval_mode = 'STAFF_APPROVAL' and private.is_assigned_staff(a.staff_id));
 if p_target = 'DECLINED' then
   if not manager then raise exception 'Approval is not authorized for this booking' using errcode = '42501'; end if;
   if a.state = 'DECLINED' then return; end if;
 else
   if not (private.is_admin() or private.is_assigned_staff(a.staff_id)) then
     if not private.owns_customer(a.customer_id) or p_target <> 'CANCELLED' then
       raise exception 'Not authorized' using errcode = '42501'; end if;
     select * into pol from public.booking_policy_versions where id = a.policy_version_id;
     if a.state = 'CONFIRMED' and clock_timestamp() > a.starts_at - make_interval(mins => pol.cancellation_notice_minutes)
     then raise exception 'Cancellation window closed'; end if;
   end if;
 end if;
 if p_target not in ('DECLINED','CANCELLED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW')
 then raise exception 'Use the dedicated transition command'; end if;
 if p_target = 'DECLINED' and coalesce(length(trim(p_reason)),0) < 10
 then raise exception 'Provide a useful decline reason (at least 10 characters)'; end if;
 if p_target = 'CANCELLED' and coalesce(length(trim(p_reason)),0) = 0
 then raise exception 'Reason required'; end if;
 if p_target = 'NO_SHOW' then
   select * into pol from public.booking_policy_versions where id = a.policy_version_id;
   if clock_timestamp() < a.starts_at + make_interval(mins => pol.no_show_grace_minutes)
   then raise exception 'No-show grace period has not elapsed'; end if;
 end if;
 update public.appointments set state = p_target,
  declined_by = case when p_target = 'DECLINED' then auth.uid() else declined_by end,
  declined_at = case when p_target = 'DECLINED' then clock_timestamp() else declined_at end,
  decline_reason = case when p_target = 'DECLINED' then trim(p_reason) else decline_reason end,
  cancelled_at = case when p_target = 'CANCELLED' then clock_timestamp() else cancelled_at end,
  cancellation_reason = case when p_target = 'CANCELLED' then trim(p_reason) else cancellation_reason end
 where id = a.id;
end; $$;

create or replace function private.log_appointment_transition() returns trigger
language plpgsql security definer set search_path = '' as $$
declare previous public.appointment_state; event_id uuid; event_actor uuid;
begin
 if tg_op = 'UPDATE' then
   if old.state = new.state then return new; end if;
   previous := old.state;
 end if;
 event_actor := case when new.state in ('ACCEPTED','AWAITING_PAYMENT','CONFIRMED')
   and new.acceptance_source = 'AUTO' then null
   when new.state = 'PAYMENT_EXPIRED' then null
   else auth.uid() end;
 insert into public.appointment_events(appointment_id,from_state,to_state,actor_id,reason)
 values(new.id,previous,new.state,event_actor,
   case when new.state = 'DECLINED' then new.decline_reason
        when new.state = 'CANCELLED' then new.cancellation_reason end)
 returning id into event_id;
 insert into public.notification_outbox(appointment_id,kind,deduplication_key,payload)
 values(new.id,'APPOINTMENT_STATE_CHANGED',event_id::text,jsonb_build_object('state',new.state));
 if tg_op = 'UPDATE' and new.state in ('ACCEPTED','DECLINED','PAYMENT_EXPIRED','CONFIRMED','AWAITING_PAYMENT') then
   insert into public.audit_logs(actor_id,action,entity_table,entity_id,details)
   values(event_actor,case new.state
     when 'ACCEPTED' then 'BOOKING_ACCEPTED'
     when 'DECLINED' then 'BOOKING_DECLINED'
     when 'PAYMENT_EXPIRED' then 'PAYMENT_EXPIRED'
     when 'CONFIRMED' then 'BOOKING_CONFIRMED'
     else 'PAYMENT_REQUIRED' end,
     'appointments',new.id,jsonb_build_object('from_state',old.state,'to_state',new.state,
       'acceptance_source',new.acceptance_source));
 end if;
 return new;
end; $$;

-- Business settings already audit updates. Keep the mode write behind MFA.
create function private.set_booking_approval_mode(p_mode text) returns text
language plpgsql security definer set search_path = '' as $$
begin
 if not private.is_admin() then raise exception 'Admin with MFA required' using errcode = '42501'; end if;
 if p_mode not in ('ADMIN_APPROVAL','STAFF_APPROVAL','AUTO_CONFIRM') then
   raise exception 'Invalid approval mode' using errcode = '22023'; end if;
 perform private.lock_schedule();
 update public.business_settings set booking_approval_mode = p_mode where singleton;
 if not found then raise exception 'Business settings required'; end if;
 return p_mode;
end; $$;
revoke all on function private.set_booking_approval_mode(text) from public,anon,authenticated,service_role;
grant execute on function private.set_booking_approval_mode(text) to authenticated;
create function public.set_booking_approval_mode(p_mode text) returns text
language sql security invoker set search_path = '' as $$
 select private.set_booking_approval_mode(p_mode); $$;
revoke all on function public.set_booking_approval_mode(text) from public,anon,authenticated,service_role;
grant execute on function public.set_booking_approval_mode(text) to authenticated;

-- Retain existing public lifecycle grants and service-role-only expiration.
revoke all on function public.expire_due_payments(), private.expire_due_payments()
 from public,anon,authenticated;
grant execute on function public.expire_due_payments(), private.expire_due_payments() to service_role;

-- Publish only the approval mode needed to explain the booking flow to visitors.
create or replace function private.public_website_data() returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object(
  'business', case when b.published then jsonb_build_object('name',b.name,'description',b.description,'timezone',b.timezone,'currency',b.currency,'contact_email',b.contact_email,'contact_phone',b.contact_phone,'address',b.address,'guest_booking_enabled',b.guest_booking_enabled,'customer_registration_enabled',b.customer_registration_enabled,'booking_approval_mode',b.booking_approval_mode) else null end,
  'website', (select jsonb_build_object('logo_path',w.logo_path,'hero_image_path',w.hero_image_path,'primary_color',w.primary_color,'font_key',w.font_key,'sections',w.sections) from public.website_settings w where w.published),
  'services', case when b.published then (select public.public_catalog()->'services') else '[]'::jsonb end,
  'categories', case when b.published then coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'slug',c.slug,'sort_order',c.sort_order) order by c.sort_order,c.name) from public.service_categories c where c.active and c.published),'[]'::jsonb) else '[]'::jsonb end,
  'staff', case when b.published then (select public.public_catalog()->'staff') else '[]'::jsonb end,
  'assignments', case when b.published then (select public.public_catalog()->'assignments') else '[]'::jsonb end,
  'hours', case when b.published then coalesce((select jsonb_agg(jsonb_build_object('weekday',h.weekday,'opens_at',h.opens_at,'closes_at',h.closes_at) order by h.weekday,h.opens_at) from public.business_hours h),'[]'::jsonb) else '[]'::jsonb end,
  'announcements', case when b.published then coalesce((select jsonb_agg(jsonb_build_object('title',a.title,'body',a.body,'starts_at',a.starts_at,'ends_at',a.ends_at) order by a.starts_at desc) from public.announcements a where a.published and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now())),'[]'::jsonb) else '[]'::jsonb end,
  'policy', (select jsonb_build_object('terms',p.terms,'minimum_notice_minutes',p.minimum_notice_minutes,'maximum_advance_days',p.maximum_advance_days,'cancellation_notice_minutes',p.cancellation_notice_minutes) from public.booking_policy_versions p where p.published order by p.version desc limit 1)
 ) from public.business_settings b limit 1;
$$;
