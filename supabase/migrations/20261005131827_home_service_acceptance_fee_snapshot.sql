-- Keep appointment acquisition compatible with Home Service totals. The
-- service item remains the service-price snapshot; the separate fee snapshot
-- is part of the appointment total and must be included when revalidating it.
create or replace function private.acquire_appointment(p_appointment uuid, p_automatic boolean)
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
    or a.total_amount <> i.price_amount + a.home_service_fee_snapshot
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
