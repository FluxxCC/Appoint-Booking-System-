-- Advisory availability is calculated from the same tables and occupied_range
-- semantics used by request/acceptance; the appointment exclusion remains final.
create function private.valid_business_local_time(p_local timestamp,p_zone text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare instant timestamptz;
begin
 instant:=p_local at time zone p_zone;
 if instant at time zone p_zone <> p_local then return false; end if;
 return not exists(select 1 from generate_series(-180,180) m where m<>0 and (instant+make_interval(mins=>m)) at time zone p_zone=p_local);
end; $$;
revoke all on function private.valid_business_local_time(timestamp,text) from public,anon,authenticated,service_role;

create function private.calculate_availability(p_service uuid,p_date date,p_staff uuid default null,p_diagnostics boolean default false)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare b public.business_settings; pol public.booking_policy_versions; s public.services; zone text; weekday_no integer; result jsonb;
begin
 if p_date is null or not isfinite(p_date) then raise exception 'Choose a valid date' using errcode='22023'; end if;
 if p_diagnostics and not private.is_admin() then raise exception 'Admin with MFA required' using errcode='42501'; end if;
 select * into b from public.business_settings;
 select * into pol from public.booking_policy_versions where published order by version desc limit 1;
 if b.id is null or pol.id is null then raise exception 'Business configuration is incomplete'; end if;
 zone:=b.timezone; weekday_no:=extract(dow from p_date)::integer;
 if p_diagnostics then
   if not exists(select 1 from public.services where id=p_service) then raise exception 'Service not found'; end if;
   select * into s from public.services where id=p_service;
 else
   if auth.uid() is null and not b.guest_booking_enabled then return jsonb_build_object('date',p_date,'timezone',zone,'slots','[]'::jsonb); end if;
   select * into s from public.services x where x.id=p_service and x.active and x.published
   and(x.category_id is null or exists(select 1 from public.service_categories c where c.id=x.category_id and c.active and c.published));
   if not found then return jsonb_build_object('date',p_date,'timezone',zone,'slots','[]'::jsonb); end if;
 end if;
 if p_date < (clock_timestamp() at time zone zone)::date
 or p_date > ((clock_timestamp()+make_interval(days=>pol.maximum_advance_days)) at time zone zone)::date
 then return jsonb_build_object('date',p_date,'service',jsonb_build_object('id',s.id,'name',s.name,'duration_minutes',s.duration_minutes,'buffer_before_minutes',s.buffer_before_minutes,'buffer_after_minutes',s.buffer_after_minutes),'timezone',zone,'scheduling_interval_minutes',b.scheduling_interval_minutes,'slots','[]'::jsonb); end if;

 with eligible as (
   select st.id,st.display_name from public.staff st join public.staff_services ss on ss.staff_id=st.id and ss.service_id=s.id and ss.active
   where st.active and st.published and st.bookable and(p_staff is null or st.id=p_staff)
 ),
 grid as (
   select (p_date+bh.opens_at+make_interval(mins=>step.n*b.scheduling_interval_minutes))::timestamp local_start,
     (p_date+bh.opens_at)::timestamp business_open,(p_date+bh.closes_at)::timestamp business_close
   from public.business_hours bh cross join lateral generate_series(0,288) step(n)
   where bh.weekday=weekday_no and p_date+bh.opens_at+make_interval(mins=>step.n*b.scheduling_interval_minutes)<p_date+bh.closes_at
 ),
 staff_load as (
   select a.staff_id,count(*) daily_load from public.appointments a
   where a.starts_at>=p_date::timestamp at time zone zone and a.starts_at<(p_date+1)::timestamp at time zone zone
    and a.state in('ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW')
    and(a.state<>'AWAITING_PAYMENT' or a.payment_due_at>clock_timestamp())
    and upper(a.occupied_range)>clock_timestamp()
   group by a.staff_id
 ),
 instants as (
   select g.*,g.local_start at time zone zone starts_at,
     (g.local_start at time zone zone)+make_interval(mins=>s.duration_minutes) ends_at,
     tstzrange((g.local_start at time zone zone)-make_interval(mins=>s.buffer_before_minutes),
       (g.local_start at time zone zone)+make_interval(mins=>s.duration_minutes+s.buffer_after_minutes),'[)') occupied
   from grid g where private.valid_business_local_time(g.local_start,zone)
   and private.valid_business_local_time(((g.local_start at time zone zone)+make_interval(mins=>s.duration_minutes+s.buffer_after_minutes)) at time zone zone,zone)
 ),
 valid as (
   select e.id staff_id,e.display_name,ix.local_start,ix.starts_at,ix.ends_at,ix.occupied,coalesce(sl.daily_load,0) daily_load
   from eligible e cross join instants ix left join staff_load sl on sl.staff_id=e.id
   where ix.local_start >= (clock_timestamp()+make_interval(mins=>pol.minimum_notice_minutes)) at time zone zone
    and ix.starts_at >= clock_timestamp()+make_interval(mins=>pol.minimum_notice_minutes)
    and ix.starts_at <= clock_timestamp()+make_interval(days=>pol.maximum_advance_days)
    and exists(select 1 from public.business_hours bh where bh.weekday=weekday_no and bh.opens_at<=((lower(ix.occupied) at time zone zone)::time) and bh.closes_at>=((upper(ix.occupied) at time zone zone)::time)
      and (upper(ix.occupied) at time zone zone)::date=p_date and(lower(ix.occupied) at time zone zone)::date=p_date)
    and (exists(select 1 from public.staff_working_hours wh where wh.staff_id=e.id and wh.weekday=weekday_no and wh.starts_at<=((lower(ix.occupied) at time zone zone)::time) and wh.ends_at>=((upper(ix.occupied) at time zone zone)::time)
       and(lower(ix.occupied) at time zone zone)::date=p_date and(upper(ix.occupied) at time zone zone)::date=p_date)
      or exists(select 1 from public.staff_schedule_exceptions ex where ex.staff_id=e.id and ex.kind='EXTRA_HOURS' and tstzrange(ex.starts_at,ex.ends_at,'[)')@>ix.occupied))
    and not exists(select 1 from public.business_closures c where tstzrange(c.starts_at,c.ends_at,'[)')&&ix.occupied)
    and not exists(select 1 from public.staff_schedule_exceptions ex where ex.staff_id=e.id and ex.kind='UNAVAILABLE' and tstzrange(ex.starts_at,ex.ends_at,'[)')&&ix.occupied)
    and not exists(select 1 from public.appointments a where a.staff_id=e.id and a.occupied_range&&ix.occupied
      and a.state in('ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW')
      and(a.state<>'AWAITING_PAYMENT' or a.payment_due_at>clock_timestamp()))
 ),
 slots as (
   select v.starts_at,v.ends_at,v.local_start,
    jsonb_agg(v.staff_id order by v.staff_id) staff_ids,
    (array_agg(v.staff_id order by v.daily_load,v.staff_id))[1] assigned_staff_id,
    jsonb_agg(jsonb_build_object('id',v.staff_id,'display_name',v.display_name) order by v.staff_id) eligible_staff
   from valid v group by v.starts_at,v.ends_at,v.local_start
 )
 select coalesce(jsonb_agg(jsonb_build_object('starts_at',starts_at,'ends_at',ends_at,'local_time',to_char(local_start,'HH24:MI'),
   'staff_ids',staff_ids,'assigned_staff_id',assigned_staff_id,'staff',eligible_staff) order by starts_at),'[]'::jsonb)
 into result from slots;

 result:=jsonb_build_object('date',p_date,'timezone',zone,'service',jsonb_build_object('id',s.id,'name',s.name,'duration_minutes',s.duration_minutes,'buffer_before_minutes',s.buffer_before_minutes,'buffer_after_minutes',s.buffer_after_minutes),
 'scheduling_interval_minutes',b.scheduling_interval_minutes,'slots',coalesce(result,'[]'::jsonb));
 if p_diagnostics then
  result:=result||jsonb_build_object('diagnostics',jsonb_build_object(
   'business_hours',coalesce((select jsonb_agg(jsonb_build_object('opens_at',opens_at,'closes_at',closes_at) order by opens_at) from public.business_hours where weekday=weekday_no),'[]'),
   'staff_hours',coalesce((select jsonb_agg(jsonb_build_object('staff_id',st.id,'display_name',st.display_name,'starts_at',wh.starts_at,'ends_at',wh.ends_at) order by st.display_name,wh.starts_at) from public.staff st join public.staff_services ss on ss.staff_id=st.id and ss.service_id=s.id and ss.active join public.staff_working_hours wh on wh.staff_id=st.id and wh.weekday=weekday_no where st.active and st.published and st.bookable and(p_staff is null or st.id=p_staff)),'[]'),
   'closures',coalesce((select jsonb_agg(jsonb_build_object('starts_at',starts_at,'ends_at',ends_at,'reason',public_reason) order by starts_at) from public.business_closures where tstzrange(starts_at,ends_at,'[)')&&tstzrange(p_date::timestamp at time zone zone,(p_date+1)::timestamp at time zone zone,'[)')),'[]'),
   'exceptions',coalesce((select jsonb_agg(jsonb_build_object('staff_id',staff_id,'kind',kind,'starts_at',starts_at,'ends_at',ends_at,'reason',reason) order by starts_at) from public.staff_schedule_exceptions where starts_at<(p_date+1)::timestamp at time zone zone and ends_at>p_date::timestamp at time zone zone and(p_staff is null or staff_id=p_staff)),'[]'),
   'blocked_intervals',coalesce((select jsonb_agg(jsonb_build_object('staff_id',staff_id,'starts_at',lower(occupied_range),'ends_at',upper(occupied_range),'state',state) order by starts_at) from public.appointments where starts_at<(p_date+1)::timestamp at time zone zone and ends_at>p_date::timestamp at time zone zone and state in('ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW') and(state<>'AWAITING_PAYMENT' or payment_due_at>clock_timestamp()) and(p_staff is null or staff_id=p_staff)),'[]')));
 end if;
 return result;
end; $$;
revoke all on function private.calculate_availability(uuid,date,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function private.calculate_availability(uuid,date,uuid,boolean) to anon,authenticated;

create function public.availability_for_date(p_service uuid,p_date date,p_staff uuid default null)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select private.calculate_availability(p_service,p_date,p_staff,false);
$$;
create function public.admin_availability_for_date(p_service uuid,p_date date,p_staff uuid default null)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select private.calculate_availability(p_service,p_date,p_staff,true);
$$;
revoke all on function public.availability_for_date(uuid,date,uuid),public.admin_availability_for_date(uuid,date,uuid) from public,anon,authenticated;
grant execute on function public.availability_for_date(uuid,date,uuid) to anon,authenticated;
grant execute on function public.admin_availability_for_date(uuid,date,uuid) to authenticated;

-- Revalidate that submitted starts still belong to the configured business slot grid.
create or replace function private.request_appointment(p_customer uuid,p_staff uuid,p_service uuid,p_start timestamptz,p_request_key uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.services; pol public.booking_policy_versions; b public.business_settings;
a public.appointments; result uuid; finish timestamptz; occupied tstzrange; local_start timestamp;
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
 select * into s from public.services where id=p_service and active and published
 and (category_id is null or exists(select 1 from public.service_categories c where c.id=category_id and c.active and c.published));
 if not found then raise exception 'Service is unavailable'; end if;
 if not exists(select 1 from public.staff st join public.staff_services ss on ss.staff_id=st.id
 where st.id=p_staff and st.active and st.bookable and st.published and ss.service_id=p_service and ss.active)
 then raise exception 'Staff cannot provide service'; end if;
 select * into pol from public.booking_policy_versions where published order by version desc limit 1;
 if not found then raise exception 'Published booking policy required'; end if;
 select * into b from public.business_settings;
 if not found then raise exception 'Business settings required'; end if;
 local_start := p_start at time zone b.timezone;
 if not exists(select 1 from public.business_hours h where h.weekday=extract(dow from local_start)::integer and h.opens_at<=local_start::time and h.closes_at>local_start::time and mod(extract(epoch from (local_start::time-h.opens_at))::integer,b.scheduling_interval_minutes*60)=0) then raise exception 'Start time is no longer on the configured schedule interval'; end if;
 if not private.valid_business_local_time(local_start,b.timezone) then raise exception 'Ambiguous or invalid local start time'; end if;
 if p_start < clock_timestamp() + make_interval(mins=>pol.minimum_notice_minutes)
 or p_start > clock_timestamp() + make_interval(days=>pol.maximum_advance_days) then raise exception 'Outside booking window'; end if;
 finish := p_start + make_interval(mins=>s.duration_minutes);
 occupied := tstzrange(p_start-make_interval(mins=>s.buffer_before_minutes),finish+make_interval(mins=>s.buffer_after_minutes),'[)');
 if not private.valid_business_local_time(lower(occupied) at time zone b.timezone,b.timezone)
 or not private.valid_business_local_time(upper(occupied) at time zone b.timezone,b.timezone)
 then raise exception 'Ambiguous or invalid local occupied interval'; end if;
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
