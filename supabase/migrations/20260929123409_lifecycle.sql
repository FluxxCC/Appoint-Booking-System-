-- Private SECURITY DEFINER routines are the narrow write boundary.
-- Public wrappers remain SECURITY INVOKER; EXECUTE grants are explicit in migration 3.
create function private.is_active_user() returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles where auth_user_id = auth.uid() and disabled_at is null);
$$;
create function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select private.is_active_user() and exists(select 1 from public.user_roles where auth_user_id = auth.uid() and role in ('ADMIN','OWNER'));
$$;
create function private.is_owner() returns boolean language sql stable security definer set search_path = '' as $$
 select private.is_active_user() and exists(select 1 from public.user_roles where auth_user_id = auth.uid() and role = 'OWNER');
$$;
create function private.is_assigned_staff(p_staff uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.is_active_user() and exists(select 1 from public.staff s join public.user_roles r on r.auth_user_id = s.auth_user_id
 where s.id = p_staff and s.auth_user_id = auth.uid() and s.active and r.role = 'STAFF');
$$;
create function private.owns_customer(p_customer uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.is_active_user() and exists(select 1 from public.customers where id = p_customer and auth_user_id = auth.uid());
$$;
create function private.can_read_appointment(p_appointment uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists(select 1 from public.appointments a where a.id = p_appointment and
 (private.is_admin() or private.is_assigned_staff(a.staff_id) or private.owns_customer(a.customer_id)));
$$;
create function private.can_manage_appointment(p_appointment uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists(select 1 from public.appointments a where a.id = p_appointment and
 (private.is_admin() or private.is_assigned_staff(a.staff_id)));
$$;

create function private.bootstrap_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 -- Metadata is deliberately ignored: it cannot grant roles or link guest records.
 insert into public.profiles(auth_user_id, display_name) values (new.id, 'Customer');
 return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.bootstrap_profile();

create function private.validate_business_settings() returns trigger language plpgsql set search_path = '' as $$
begin
 if not exists(select 1 from pg_timezone_names where name=new.timezone) then raise exception 'Unknown IANA timezone'; end if;
 if tg_op='UPDATE' and (new.currency,new.timezone) is distinct from (old.currency,old.timezone)
 and exists(select 1 from public.appointments) then raise exception 'Changing operating timezone or currency requires an explicit data migration'; end if;
 return new;
end; $$;
create trigger validate_business_settings before insert or update on public.business_settings for each row execute function private.validate_business_settings();

create function private.schedule_write_lock() returns trigger language plpgsql set search_path = '' as $$
begin perform private.lock_schedule(); return null; end; $$;

create function private.validate_schedule(p_staff uuid, p_start timestamptz, p_end timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare tz text; ls timestamp; le timestamp; day_number integer;
begin
 select timezone into tz from public.business_settings;
 if tz is null then raise exception 'Business settings must be configured'; end if;
 ls := p_start at time zone tz; le := p_end at time zone tz;
 if ls::date <> le::date then raise exception 'Overnight appointments are not supported in this phase'; end if;
 day_number := extract(dow from ls)::integer;
 if not exists(select 1 from public.business_hours where weekday = day_number and opens_at <= ls::time and closes_at >= le::time)
 then raise exception 'Outside business hours'; end if;
 if not (exists(select 1 from public.staff_working_hours where staff_id = p_staff and weekday = day_number and starts_at <= ls::time and ends_at >= le::time)
 or exists(select 1 from public.staff_schedule_exceptions where staff_id = p_staff and kind = 'EXTRA_HOURS' and starts_at <= p_start and ends_at >= p_end))
 then raise exception 'Outside staff working hours'; end if;
 if exists(select 1 from public.business_closures where tstzrange(starts_at, ends_at, '[)') && tstzrange(p_start,p_end,'[)'))
 or exists(select 1 from public.staff_schedule_exceptions where staff_id = p_staff and kind = 'UNAVAILABLE' and tstzrange(starts_at, ends_at, '[)') && tstzrange(p_start,p_end,'[)'))
 then raise exception 'Slot intersects a closure or staff absence'; end if;
end; $$;

create function private.protect_existing_schedule() returns trigger language plpgsql security definer set search_path = '' as $$
declare a record;
begin
 for a in select * from public.appointments
 where ends_at > clock_timestamp() and state in ('ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS')
 loop
   perform private.validate_schedule(a.staff_id, lower(a.occupied_range), upper(a.occupied_range));
 end loop;
 return null;
end; $$;

create function private.guard_appointment() returns trigger language plpgsql set search_path = '' as $$
declare allowed boolean := false; paid bigint;
begin
 new.occupied_range := tstzrange(new.starts_at - make_interval(mins => new.buffer_before_minutes),
 new.ends_at + make_interval(mins => new.buffer_after_minutes), '[)');
 if tg_op = 'INSERT' then
   if new.state <> 'PENDING' or new.accepted_at is not null or new.accepted_by is not null or new.payment_due_at is not null then
     raise exception 'New appointments must be pending and unpaid';
   end if;
   return new;
 end if;
 if (new.customer_id,new.staff_id,new.policy_version_id,new.request_key,new.starts_at,new.ends_at,new.buffer_before_minutes,new.buffer_after_minutes,new.currency,new.total_amount,new.payment_mode_snapshot,new.required_payment_amount)
 is distinct from
 (old.customer_id,old.staff_id,old.policy_version_id,old.request_key,old.starts_at,old.ends_at,old.buffer_before_minutes,old.buffer_after_minutes,old.currency,old.total_amount,old.payment_mode_snapshot,old.required_payment_amount)
 then raise exception 'Booking snapshots and intervals are immutable; rescheduling requires a future dedicated command'; end if;
 if old.accepted_at is not null and (new.accepted_at,new.accepted_by) is distinct from (old.accepted_at,old.accepted_by)
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
 if new.state = 'ACCEPTED' and (auth.uid() is null or new.accepted_by <> auth.uid()
 or not (private.is_admin() or private.is_assigned_staff(new.staff_id))) then raise exception 'Authorized staff acceptance required'; end if;
 if new.state = 'CONFIRMED' and old.state = 'AWAITING_PAYMENT' then
   if clock_timestamp() >= old.payment_due_at then raise exception 'Payment reservation expired'; end if;
   select coalesce(sum(amount),0) into paid from public.payments where appointment_id = new.id and state = 'SUCCEEDED'
   and currency = new.currency and paid_at < old.payment_due_at and exception_reason is null;
   if paid < new.required_payment_amount then raise exception 'Verified payment required'; end if;
 end if;
 if new.state = 'PAYMENT_EXPIRED' and clock_timestamp() < old.payment_due_at then raise exception 'Reservation has not expired'; end if;
 return new;
end; $$;
create trigger guard_appointment before insert or update on public.appointments for each row execute function private.guard_appointment();

create function private.reject_stalled_acceptance() returns trigger language plpgsql set search_path = '' as $$
begin
 if exists(select 1 from public.appointments where id = new.id and state = 'ACCEPTED') then
 raise exception 'Acceptance must resolve payment mode in the same transaction'; end if;
 return null;
end; $$;
create constraint trigger resolve_acceptance after insert or update on public.appointments
deferrable initially deferred for each row execute function private.reject_stalled_acceptance();

create function private.log_appointment_transition() returns trigger language plpgsql security definer set search_path = '' as $$
declare previous public.appointment_state; event_id uuid;
begin
 if tg_op = 'UPDATE' then
   if old.state = new.state then return new; end if;
   previous := old.state;
 end if;
 insert into public.appointment_events(appointment_id,from_state,to_state,actor_id,reason)
 values(new.id,previous,new.state,auth.uid(),case when new.state = 'DECLINED' then new.decline_reason when new.state = 'CANCELLED' then new.cancellation_reason end)
 returning id into event_id;
 insert into public.notification_outbox(appointment_id,kind,deduplication_key,payload)
 values(new.id,'APPOINTMENT_STATE_CHANGED',event_id::text,jsonb_build_object('state',new.state));
 return new;
end; $$;
create trigger log_appointment_transition after insert or update on public.appointments for each row execute function private.log_appointment_transition();

create function private.expire_due_payments() returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
 perform private.lock_schedule();
 update public.appointments set state = 'PAYMENT_EXPIRED', payment_expired_at = clock_timestamp()
 where state = 'AWAITING_PAYMENT' and payment_due_at <= clock_timestamp();
 get diagnostics affected = row_count;
 return affected;
end; $$;

create function private.request_appointment(p_customer uuid,p_staff uuid,p_service uuid,p_start timestamptz,p_request_key uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.services; pol public.booking_policy_versions; b public.business_settings;
a public.appointments; result uuid; finish timestamptz; occupied tstzrange;
begin
 if not (private.owns_customer(p_customer) or private.is_admin()
 or (current_setting('role',true) = 'service_role' and auth.uid() is null))
 then raise exception 'Not authorized'; end if;
 perform private.lock_schedule();
 select * into a from public.appointments where request_key = p_request_key;
 if found then
   if a.customer_id <> p_customer or a.staff_id <> p_staff or a.starts_at <> p_start
   or not exists(select 1 from public.appointment_items where appointment_id=a.id and service_id=p_service)
   then raise exception 'Idempotency key reused with different booking'; end if;
   return a.id;
 end if;
 select * into s from public.services where id=p_service and active and published;
 if not found then raise exception 'Service is unavailable'; end if;
 if not exists(select 1 from public.staff st join public.staff_services ss on ss.staff_id=st.id
 where st.id=p_staff and st.active and st.bookable and st.published and ss.service_id=p_service and ss.active)
 then raise exception 'Staff cannot provide service'; end if;
 select * into pol from public.booking_policy_versions where published order by version desc limit 1;
 if not found then raise exception 'Published booking policy required'; end if;
 select * into b from public.business_settings;
 if not found then raise exception 'Business settings required'; end if;
 if p_start < clock_timestamp() + make_interval(mins=>pol.minimum_notice_minutes)
 or p_start > clock_timestamp() + make_interval(days=>pol.maximum_advance_days) then raise exception 'Outside booking window'; end if;
 finish := p_start + make_interval(mins=>s.duration_minutes);
 occupied := tstzrange(p_start-make_interval(mins=>s.buffer_before_minutes),finish+make_interval(mins=>s.buffer_after_minutes),'[)');
 perform private.validate_schedule(p_staff,lower(occupied),upper(occupied));
 perform private.expire_due_payments();
 if exists(select 1 from public.appointments where staff_id=p_staff and occupied_range && occupied
 and state in ('ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW'))
 then raise exception 'Slot already reserved'; end if;
 insert into public.appointments(customer_id,staff_id,policy_version_id,request_key,starts_at,ends_at,
 buffer_before_minutes,buffer_after_minutes,occupied_range,currency,total_amount,payment_mode_snapshot,required_payment_amount)
 values(p_customer,p_staff,pol.id,p_request_key,p_start,finish,s.buffer_before_minutes,s.buffer_after_minutes,occupied,b.currency,s.price_amount,
 s.payment_mode,case s.payment_mode when 'PAY_AT_BUSINESS' then 0 when 'FULL_PAYMENT' then s.price_amount else s.deposit_amount end)
 returning id into result;
 insert into public.appointment_items(appointment_id,service_id,service_name_snapshot,price_amount,duration_minutes,buffer_before_minutes,buffer_after_minutes)
 values(result,s.id,s.name,s.price_amount,s.duration_minutes,s.buffer_before_minutes,s.buffer_after_minutes);
 return result;
end; $$;

create function private.accept_appointment(p_appointment uuid) returns public.appointment_state
language plpgsql security definer set search_path = '' as $$
declare a public.appointments; pol public.booking_policy_versions; next_state public.appointment_state;
begin
 if not private.can_manage_appointment(p_appointment) then raise exception 'Not authorized'; end if;
 perform private.lock_schedule();
 perform private.expire_due_payments();
 select * into a from public.appointments where id=p_appointment for update;
 if a.state <> 'PENDING' then raise exception 'Only pending requests can be accepted'; end if;
 select * into pol from public.booking_policy_versions where id=a.policy_version_id;
 if a.starts_at < clock_timestamp()+make_interval(mins=>pol.minimum_notice_minutes) then raise exception 'Booking notice window elapsed'; end if;
 if not exists(select 1 from public.appointment_items i join public.services s on s.id=i.service_id
 join public.staff_services ss on ss.service_id=s.id and ss.staff_id=a.staff_id
 join public.staff st on st.id=ss.staff_id
 where i.appointment_id=a.id and s.active and ss.active and st.active and st.bookable)
 then raise exception 'Staff or service is no longer available'; end if;
 perform private.validate_schedule(a.staff_id,lower(a.occupied_range),upper(a.occupied_range));
 update public.appointments set state='ACCEPTED',accepted_by=auth.uid(),accepted_at=clock_timestamp() where id=a.id;
 if a.payment_mode_snapshot = 'PAY_AT_BUSINESS' then
   next_state := 'CONFIRMED';
   update public.appointments set state=next_state where id=a.id;
 else
   next_state := 'AWAITING_PAYMENT';
   update public.appointments set state=next_state,
   payment_due_at=least(clock_timestamp()+make_interval(mins=>pol.payment_window_minutes),a.starts_at) where id=a.id;
 end if;
 return next_state;
end; $$;

create function private.transition_appointment(p_appointment uuid,p_target public.appointment_state,p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.appointments; pol public.booking_policy_versions; manager boolean;
begin
 if auth.uid() is null or not private.is_active_user() then raise exception 'Authentication required'; end if;
 perform private.lock_schedule();
 select * into a from public.appointments where id=p_appointment for update;
 if not found then raise exception 'Appointment unavailable'; end if;
 manager := private.can_manage_appointment(p_appointment);
 if not manager then
   if not private.owns_customer(a.customer_id) or p_target <> 'CANCELLED' then raise exception 'Not authorized'; end if;
   select * into pol from public.booking_policy_versions where id=a.policy_version_id;
   if a.state='CONFIRMED' and clock_timestamp() > a.starts_at-make_interval(mins=>pol.cancellation_notice_minutes)
   then raise exception 'Cancellation window closed'; end if;
 end if;
 if p_target not in ('DECLINED','CANCELLED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW') then raise exception 'Use the dedicated transition command'; end if;
 if p_target in ('DECLINED','CANCELLED') and coalesce(length(trim(p_reason)),0)=0 then raise exception 'Reason required'; end if;
 if p_target='NO_SHOW' then
   select * into pol from public.booking_policy_versions where id=a.policy_version_id;
   if clock_timestamp() < a.starts_at+make_interval(mins=>pol.no_show_grace_minutes) then raise exception 'No-show grace period has not elapsed'; end if;
 end if;
 update public.appointments set state=p_target,
 declined_by=case when p_target='DECLINED' then auth.uid() else declined_by end,
 declined_at=case when p_target='DECLINED' then clock_timestamp() else declined_at end,
 decline_reason=case when p_target='DECLINED' then p_reason else decline_reason end,
 cancelled_at=case when p_target='CANCELLED' then clock_timestamp() else cancelled_at end,
 cancellation_reason=case when p_target='CANCELLED' then p_reason else cancellation_reason end
 where id=a.id;
end; $$;

-- Payment records can only be created for accepted, payable reservations.
create function private.guard_payment() returns trigger language plpgsql set search_path = '' as $$
declare a public.appointments; collected bigint;
begin
 select * into a from public.appointments where id=new.appointment_id for update;
 if tg_op='INSERT' then
   if a.accepted_at is null or a.state not in ('AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW')
   then raise exception 'Payment requires staff acceptance'; end if;
   if a.state='AWAITING_PAYMENT' and a.payment_due_at <= clock_timestamp() then raise exception 'Payment deadline passed'; end if;
   if new.state <> 'PENDING' then raise exception 'Payment attempts must start pending'; end if;
   if new.currency <> a.currency or new.amount > a.total_amount then raise exception 'Invalid payment amount or currency'; end if;
   select coalesce(sum(amount),0) into collected from public.payments where appointment_id=a.id and state='SUCCEEDED' and exception_reason is null;
   if collected + new.amount > a.total_amount then raise exception 'Payment exceeds outstanding amount'; end if;
   if a.state='AWAITING_PAYMENT' and new.amount <> a.required_payment_amount-collected then raise exception 'Payment must match the required deposit or full amount'; end if;
 else
   if (new.appointment_id,new.provider,new.provider_reference,new.idempotency_key,new.amount,new.currency)
   is distinct from (old.appointment_id,old.provider,old.provider_reference,old.idempotency_key,old.amount,old.currency)
   then raise exception 'Payment identity and amount are immutable'; end if;
   if old.state='SUCCEEDED' and new is distinct from old then raise exception 'Successful payments are immutable'; end if;
 end if;
 return new;
end; $$;
create trigger guard_payment before insert or update on public.payments for each row execute function private.guard_payment();

-- Trusted gateway adapter calls this ONLY after verifying provider signatures and facts.
-- A late event records funds without resurrecting an expired/cancelled reservation.
create function private.record_verified_payment(p_payment uuid,p_event_id text,p_paid_at timestamptz)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.payments; a public.appointments; result text;
begin
 if current_setting('role',true) <> 'service_role' then raise exception 'Backend only'; end if;
 perform private.lock_schedule();
 select * into p from public.payments where id=p_payment for update;
 if not found then raise exception 'Unknown payment'; end if;
 select * into a from public.appointments where id=p.appointment_id for update;
 if p.state='SUCCEEDED' then return coalesce(p.exception_reason,case when a.state='CONFIRMED' then 'CONFIRMED' else 'RECORDED' end); end if;
 if p_paid_at is null or p_paid_at > clock_timestamp() or p_paid_at < p.created_at then raise exception 'Invalid provider payment timestamp'; end if;
 insert into public.payment_events(provider,provider_event_id,payment_id,processed_at)
 values(p.provider,p_event_id,p.id,clock_timestamp());
 result := 'RECORDED';
 if a.state='AWAITING_PAYMENT' and clock_timestamp() < a.payment_due_at and p_paid_at < a.payment_due_at then
   update public.payments set state='SUCCEEDED',paid_at=p_paid_at,verified_at=clock_timestamp() where id=p.id;
   if (select coalesce(sum(amount),0) from public.payments where appointment_id=a.id and state='SUCCEEDED' and exception_reason is null) >= a.required_payment_amount then
     update public.appointments set state='CONFIRMED' where id=a.id;
     result := 'CONFIRMED';
   end if;
 elsif a.state in ('CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW') then
   update public.payments set state='SUCCEEDED',paid_at=p_paid_at,verified_at=clock_timestamp() where id=p.id;
 else
   result := 'LATE_PAYMENT_REVIEW';
   update public.payments set state='SUCCEEDED',paid_at=p_paid_at,verified_at=clock_timestamp(),exception_reason=result where id=p.id;
   if a.state='AWAITING_PAYMENT' then perform private.expire_due_payments(); end if;
   insert into public.notification_outbox(appointment_id,kind,deduplication_key,payload)
   values(a.id,'PAYMENT_EXCEPTION','payment-exception:'||p.id,jsonb_build_object('payment_id',p.id));
 end if;
 return result;
end; $$;

create function private.guard_refund() returns trigger language plpgsql set search_path = '' as $$
declare p public.payments; reserved bigint;
begin
 select * into p from public.payments where id=new.payment_id for update;
 if p.state <> 'SUCCEEDED' then raise exception 'Only successful payments can be refunded'; end if;
 if tg_op='UPDATE' then
   if (new.payment_id,new.amount,new.idempotency_key) is distinct from (old.payment_id,old.amount,old.idempotency_key)
   or (old.state='SUCCEEDED' and new.state <> old.state) then raise exception 'Refund identity or success is immutable'; end if;
 end if;
 select coalesce(sum(amount),0) into reserved from public.refunds where payment_id=p.id and id<>new.id and state in ('PENDING','SUCCEEDED');
 if new.state in ('PENDING','SUCCEEDED') and reserved+new.amount > p.amount then raise exception 'Refund exceeds remaining balance'; end if;
 return new;
end; $$;
create trigger guard_refund before insert or update on public.refunds for each row execute function private.guard_refund();

create function public.request_appointment(p_customer uuid,p_staff uuid,p_service uuid,p_start timestamptz,p_request_key uuid)
returns uuid language sql security invoker set search_path = '' as $$
 select private.request_appointment(p_customer,p_staff,p_service,p_start,p_request_key); $$;
create function public.accept_appointment(p_appointment uuid) returns public.appointment_state
language sql security invoker set search_path = '' as $$ select private.accept_appointment(p_appointment); $$;
create function public.transition_appointment(p_appointment uuid,p_target public.appointment_state,p_reason text default null)
returns void language sql security invoker set search_path = '' as $$ select private.transition_appointment(p_appointment,p_target,p_reason); $$;
create function public.expire_due_payments() returns integer
language sql security invoker set search_path = '' as $$ select private.expire_due_payments(); $$;
create function public.record_verified_payment(p_payment uuid,p_event_id text,p_paid_at timestamptz) returns text
language sql security invoker set search_path = '' as $$ select private.record_verified_payment(p_payment,p_event_id,p_paid_at); $$;

-- Statement locks run before row locks, avoiding inverted lock order.
create trigger schedule_write_lock before insert or update or delete on public.appointments for each statement execute function private.schedule_write_lock();
create trigger schedule_write_lock before insert or update or delete on public.payments for each statement execute function private.schedule_write_lock();
create trigger schedule_write_lock before insert or update or delete on public.refunds for each statement execute function private.schedule_write_lock();
create trigger schedule_write_lock before insert or update or delete on public.business_hours for each statement execute function private.schedule_write_lock();
create trigger schedule_write_lock before insert or update or delete on public.staff_working_hours for each statement execute function private.schedule_write_lock();
create trigger schedule_write_lock before insert or update or delete on public.staff_schedule_exceptions for each statement execute function private.schedule_write_lock();
create trigger schedule_write_lock before insert or update or delete on public.business_closures for each statement execute function private.schedule_write_lock();
create trigger schedule_write_lock before insert or update or delete on public.business_settings for each statement execute function private.schedule_write_lock();
create trigger schedule_write_lock before insert or update or delete on public.services for each statement execute function private.schedule_write_lock();
create trigger schedule_write_lock before insert or update or delete on public.staff for each statement execute function private.schedule_write_lock();
create trigger schedule_write_lock before insert or update or delete on public.staff_services for each statement execute function private.schedule_write_lock();
create trigger protect_existing_schedule after insert or update or delete on public.business_hours for each statement execute function private.protect_existing_schedule();
create trigger protect_existing_schedule after insert or update or delete on public.staff_working_hours for each statement execute function private.protect_existing_schedule();
create trigger protect_existing_schedule after insert or update or delete on public.staff_schedule_exceptions for each statement execute function private.protect_existing_schedule();
create trigger protect_existing_schedule after insert or update or delete on public.business_closures for each statement execute function private.protect_existing_schedule();
create trigger protect_existing_schedule after insert or update or delete on public.business_settings for each statement execute function private.protect_existing_schedule();
