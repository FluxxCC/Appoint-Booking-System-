-- Forward-only Home Service foundation. Precise destination data is private and
-- remains separate from the public catalog and ordinary appointment projections.
create type public.appointment_fulfillment_mode as enum ('BUSINESS_LOCATION','HOME_SERVICE');

alter table public.business_settings
  add column service_origin_latitude numeric(9,6),
  add column service_origin_longitude numeric(9,6),
  add column home_service_max_radius_km numeric(7,2),
  add constraint business_origin_coordinates_check check (
    (service_origin_latitude is null and service_origin_longitude is null) or
    (service_origin_latitude between -90 and 90 and service_origin_longitude between -180 and 180)),
  add constraint business_home_radius_check check (home_service_max_radius_km is null or home_service_max_radius_km between 0.1 and 500);

alter table public.services
  add column supports_business_location boolean not null default true,
  add column supports_home_service boolean not null default false,
  add column home_service_fee bigint not null default 0 check (home_service_fee between 0 and 9007199254740991),
  add column home_travel_before_minutes integer not null default 0 check (home_travel_before_minutes between 0 and 240),
  add column home_travel_after_minutes integer not null default 0 check (home_travel_after_minutes between 0 and 240),
  add constraint services_fulfillment_mode_check check (supports_business_location or supports_home_service);

alter table public.appointments
  add column fulfillment_mode public.appointment_fulfillment_mode not null default 'BUSINESS_LOCATION',
  add column home_service_fee_snapshot bigint not null default 0 check (home_service_fee_snapshot between 0 and 9007199254740991),
  add column home_travel_before_snapshot integer not null default 0 check (home_travel_before_snapshot between 0 and 240),
  add column home_travel_after_snapshot integer not null default 0 check (home_travel_after_snapshot between 0 and 240),
  add column service_area_hint text;

create table public.appointment_home_locations (
  appointment_id uuid primary key references public.appointments(id) on delete restrict,
  address text not null check (length(trim(address)) between 5 and 500),
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  landmark text check (landmark is null or length(landmark) <= 200),
  instructions text check (instructions is null or length(instructions) <= 1000),
  area_hint text not null check (length(trim(area_hint)) between 2 and 120),
  created_at timestamptz not null default now()
);
alter table public.appointment_home_locations enable row level security;
revoke all on public.appointment_home_locations from anon, authenticated;
grant select on public.appointment_home_locations to authenticated;
grant all on public.appointment_home_locations to service_role;
create policy appointment_home_location_select on public.appointment_home_locations for select to authenticated using (
  exists(select 1 from public.appointments a where a.id=appointment_id and (
    (a.state not in ('PENDING','DECLINED','CANCELLED') and private.can_manage_appointment(a.id)) or
    private.is_admin() or
    exists(select 1 from public.customers c where c.id=a.customer_id and c.auth_user_id=auth.uid())
  ))
);
comment on table public.appointment_home_locations is 'Sensitive static service destination. Never use for background or live tracking.';

create index appointment_home_location_point_idx on public.appointment_home_locations(latitude,longitude);

create function private.home_service_availability_for_date(p_service uuid,p_date date,p_staff uuid default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare base jsonb; slot jsonb; staff jsonb; filtered jsonb; ids jsonb; chosen uuid; starts_at timestamptz; ends_at timestamptz;
 s public.services; before_minutes integer; after_minutes integer; occupied tstzrange; result_slots jsonb:='[]'::jsonb; staff_rows jsonb;
begin
 select * into s from public.services where id=p_service and active and published and supports_home_service;
 if not found then return jsonb_build_object('date',p_date,'timezone',private.business_timezone(),'slots','[]'::jsonb); end if;
 before_minutes:=s.buffer_before_minutes+s.home_travel_before_minutes;after_minutes:=s.buffer_after_minutes+s.home_travel_after_minutes;
 base:=private.calculate_availability(p_service,p_date,p_staff,false);
 for slot in select value from jsonb_array_elements(coalesce(base->'slots','[]'::jsonb)) loop
  starts_at:=(slot->>'starts_at')::timestamptz;ends_at:=(slot->>'ends_at')::timestamptz;
  occupied:=tstzrange(starts_at-make_interval(mins=>before_minutes),ends_at+make_interval(mins=>after_minutes),'[)');
  filtered:='[]'::jsonb;
  for staff in select value from jsonb_array_elements(coalesce(slot->'staff','[]'::jsonb)) loop
   begin
    perform private.validate_schedule((staff->>'id')::uuid,lower(occupied),upper(occupied));
    if not exists(select 1 from public.appointments a where a.staff_id=(staff->>'id')::uuid and a.occupied_range&&occupied and a.state in('ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW') and(a.state<>'AWAITING_PAYMENT' or a.payment_due_at>clock_timestamp())) then
     filtered:=filtered||jsonb_build_array(staff);
    end if;
   exception when others then null;
   end;
  end loop;
  if jsonb_array_length(filtered)>0 then
   select id into chosen from jsonb_to_recordset(filtered) x(id uuid,display_name text)
   order by (select count(*) from public.appointments a where a.staff_id=x.id and a.starts_at>=(p_date::timestamp at time zone private.business_timezone()) and a.starts_at<((p_date+1)::timestamp at time zone private.business_timezone()) and a.state in('ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW')),id limit 1;
   select coalesce(jsonb_agg((value->>'id')::uuid order by value->>'id'),'[]'::jsonb) into ids from jsonb_array_elements(filtered);
   result_slots:=result_slots||jsonb_build_array(slot||jsonb_build_object('staff',filtered,'staff_ids',ids,'assigned_staff_id',chosen));
  end if;
 end loop;
 return base||jsonb_build_object('slots',result_slots);
end; $$;
revoke all on function private.home_service_availability_for_date(uuid,date,uuid) from public,anon,authenticated;
grant execute on function private.home_service_availability_for_date(uuid,date,uuid) to service_role;
create function public.server_home_service_availability_for_date(p_service uuid,p_date date,p_staff uuid,p_auth_user uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if current_setting('role',true)<>'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
 perform set_config('request.jwt.claim.sub',coalesce(p_auth_user::text,''),true);
 return private.home_service_availability_for_date(p_service,p_date,p_staff);
end; $$;
revoke all on function public.server_home_service_availability_for_date(uuid,date,uuid,uuid) from public,anon,authenticated;
grant execute on function public.server_home_service_availability_for_date(uuid,date,uuid,uuid) to service_role;

-- Make the database occupied interval include travel only for home appointments.
create or replace function private.guard_appointment() returns trigger language plpgsql set search_path = '' as $$
declare allowed boolean := false; paid bigint;
begin
 new.occupied_range := tstzrange(new.starts_at - make_interval(mins => new.buffer_before_minutes + new.home_travel_before_snapshot),
 new.ends_at + make_interval(mins => new.buffer_after_minutes + new.home_travel_after_snapshot), '[)');
 if tg_op = 'INSERT' then
   if new.state <> 'PENDING' or new.accepted_at is not null or new.accepted_by is not null or new.payment_due_at is not null or new.acceptance_source <> 'MANUAL' then raise exception 'New appointments must be pending and unpaid'; end if;
   return new;
 end if;
 if current_setting('app.home_booking_snapshot',true) is distinct from 'on' and
 (new.customer_id,new.staff_id,new.policy_version_id,new.request_key,new.starts_at,new.ends_at,new.buffer_before_minutes,new.buffer_after_minutes,new.currency,new.total_amount,new.payment_mode_snapshot,new.required_payment_amount,new.fulfillment_mode,new.home_service_fee_snapshot,new.home_travel_before_snapshot,new.home_travel_after_snapshot,new.service_area_hint)
 is distinct from
 (old.customer_id,old.staff_id,old.policy_version_id,old.request_key,old.starts_at,old.ends_at,old.buffer_before_minutes,old.buffer_after_minutes,old.currency,old.total_amount,old.payment_mode_snapshot,old.required_payment_amount,old.fulfillment_mode,old.home_service_fee_snapshot,old.home_travel_before_snapshot,old.home_travel_after_snapshot,old.service_area_hint)
 then raise exception 'Booking snapshots and intervals are immutable; rescheduling requires a future dedicated command'; end if;
 if old.accepted_at is not null and (new.accepted_at,new.accepted_by,new.acceptance_source) is distinct from (old.accepted_at,old.accepted_by,old.acceptance_source) then raise exception 'Acceptance evidence is immutable'; end if;
 if old.payment_due_at is not null and new.payment_due_at is distinct from old.payment_due_at then raise exception 'Payment deadline is immutable'; end if;
 if new.state = old.state then return new; end if;
 allowed := case old.state
 when 'PENDING' then new.state in ('ACCEPTED','DECLINED','CANCELLED')
 when 'ACCEPTED' then (new.state = 'CONFIRMED' and new.payment_mode_snapshot = 'PAY_AT_BUSINESS') or (new.state = 'AWAITING_PAYMENT' and new.payment_mode_snapshot <> 'PAY_AT_BUSINESS')
 when 'AWAITING_PAYMENT' then new.state in ('CONFIRMED','PAYMENT_EXPIRED','CANCELLED')
 when 'CONFIRMED' then new.state in ('CHECKED_IN','CANCELLED','NO_SHOW')
 when 'CHECKED_IN' then new.state = 'IN_PROGRESS'
 when 'IN_PROGRESS' then new.state = 'COMPLETED'
 else false end;
 if not allowed then raise exception 'Invalid appointment transition: % -> %',old.state,new.state; end if;
 if new.state = 'ACCEPTED' then
   if new.acceptance_source = 'AUTO' then
     if pg_trigger_depth() < 2 or not exists(select 1 from public.business_settings where booking_approval_mode='AUTO_CONFIRM') then raise exception 'Automatic acceptance requires the booking workflow'; end if;
   elsif auth.uid() is null or new.accepted_by <> auth.uid() or not (private.is_admin() or (exists(select 1 from public.business_settings where booking_approval_mode='STAFF_APPROVAL') and private.is_assigned_staff(new.staff_id))) then raise exception 'Authorized staff acceptance required'; end if;
 end if;
 if new.state = 'CONFIRMED' and old.state = 'AWAITING_PAYMENT' then
   if clock_timestamp() >= old.payment_due_at then raise exception 'Payment reservation expired'; end if;
   select coalesce(sum(amount),0) into paid from public.payments where appointment_id = new.id and state = 'SUCCEEDED' and currency = new.currency and paid_at < old.payment_due_at and exception_reason is null;
   if paid < new.required_payment_amount then raise exception 'Verified payment required'; end if;
 end if;
 if new.state = 'PAYMENT_EXPIRED' and clock_timestamp() < old.payment_due_at then raise exception 'Reservation has not expired'; end if;
 return new;
end; $$;

-- Trusted server boundary for registered Home Service customers only. It reuses
-- the existing booking/customer/payment/lifecycle routines and adds immutable
-- snapshots plus authoritative service-area/overlap checks in the same transaction.
create function private.server_home_service_booking_submit(
 p_service uuid,p_staff uuid,p_start timestamptz,p_request_key uuid,
 p_name text,p_email text,p_phone text,p_auth_user uuid,
 p_address text,p_latitude numeric,p_longitude numeric,p_landmark text,p_instructions text,p_area_hint text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.services; b public.business_settings; result jsonb; appointment_id uuid; a public.appointments;
 total bigint; required bigint; distance_km double precision; lat1 double precision; lat2 double precision; local_day date; slot jsonb; chosen_staff uuid;
begin
 if current_setting('role',true)<>'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_auth_user is null then raise exception 'Home Service requires a registered customer account'; end if;
 if p_address is null or length(trim(p_address)) not between 5 and 500 or p_area_hint is null or length(trim(p_area_hint)) not between 2 and 120
   or p_latitude is null or p_latitude not between -90 and 90 or p_longitude is null or p_longitude not between -180 and 180
   or (p_landmark is not null and length(p_landmark)>200) or (p_instructions is not null and length(p_instructions)>1000) then raise exception 'A valid service destination is required'; end if;
 select * into s from public.services where id=p_service and active and published and supports_home_service;
 if not found then raise exception 'Home Service is unavailable for this service'; end if;
 select * into b from public.business_settings limit 1;
 if b.home_service_max_radius_km is not null then
   if b.service_origin_latitude is null or b.service_origin_longitude is null then raise exception 'Home Service area is not configured'; end if;
   lat1:=radians(p_latitude::double precision); lat2:=radians(b.service_origin_latitude::double precision);
   distance_km:=6371.0088*2*asin(sqrt(least(1,power(sin((lat2-lat1)/2),2)+cos(lat1)*cos(lat2)*power(sin((radians(b.service_origin_longitude::double precision)-radians(p_longitude::double precision))/2),2))));
   if distance_km>b.home_service_max_radius_km then raise exception 'This location is outside the current Home Service area'; end if;
 end if;
 perform set_config('request.jwt.claim.sub',p_auth_user::text,true);
 local_day:=(p_start at time zone b.timezone)::date;
 select value into slot from jsonb_array_elements(coalesce((private.home_service_availability_for_date(p_service,local_day,p_staff)->'slots'),'[]'::jsonb)) value
 where (value->>'starts_at')::timestamptz=p_start limit 1;
 if slot is null then raise exception 'This Home Service time is no longer available'; end if;
 chosen_staff:=coalesce(p_staff,nullif(slot->>'assigned_staff_id','')::uuid);
 if chosen_staff is null then raise exception 'No eligible staff member can serve this destination and time'; end if;
 result:=private.public_booking_submit(p_service,chosen_staff,p_start,p_request_key,p_name,p_email,p_phone);
 appointment_id:=(result->>'appointment_id')::uuid;
 select * into a from public.appointments where id=appointment_id for update;
 if a.fulfillment_mode='HOME_SERVICE' then
   if not exists(select 1 from public.appointment_home_locations where appointment_id=a.id and address=trim(p_address) and latitude=p_latitude and longitude=p_longitude) then raise exception 'Idempotency key reused with different Home Service details'; end if;
   return result;
 end if;
 if a.fulfillment_mode<>'BUSINESS_LOCATION' then raise exception 'Idempotency key reused with a different appointment location'; end if;
 total:=a.total_amount+s.home_service_fee;
 if total>9007199254740991 then raise exception 'Appointment total is too large'; end if;
 required:=case a.payment_mode_snapshot
  when 'PAY_AT_BUSINESS' then 0
  when 'FULL_PAYMENT' then total
  when 'DEPOSIT' then case when s.deposit_type='PERCENTAGE' then ceil(total::numeric*s.deposit_percent_bps/10000)::bigint else least(total,s.deposit_amount) end
 end;
 perform set_config('app.home_booking_snapshot','on',true);
 update public.appointments set fulfillment_mode='HOME_SERVICE',home_service_fee_snapshot=s.home_service_fee,
   home_travel_before_snapshot=s.home_travel_before_minutes,home_travel_after_snapshot=s.home_travel_after_minutes,
   service_area_hint=trim(p_area_hint),total_amount=total,required_payment_amount=required
 where id=appointment_id;
 insert into public.appointment_home_locations(appointment_id,address,latitude,longitude,landmark,instructions,area_hint)
 values(appointment_id,trim(p_address),p_latitude,p_longitude,nullif(trim(p_landmark),''),nullif(trim(p_instructions),''),trim(p_area_hint));
 insert into public.audit_logs(actor_id,action,entity_table,entity_id,details) values(p_auth_user,'home_service.booking_submitted','appointments',appointment_id,jsonb_build_object('fulfillment_mode','HOME_SERVICE'));
 if a.state in ('CONFIRMED','AWAITING_PAYMENT','ACCEPTED') then
   perform private.validate_schedule(a.staff_id,lower((select occupied_range from public.appointments where id=appointment_id)),upper((select occupied_range from public.appointments where id=appointment_id)));
   if exists(select 1 from public.appointments x where x.id<>appointment_id and x.staff_id=a.staff_id and x.occupied_range&&(select occupied_range from public.appointments where id=appointment_id) and x.state in('ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW')) then raise exception 'That time is no longer available with the required travel time'; end if;
 end if;
 return result;
end; $$;
revoke all on function private.server_home_service_booking_submit(uuid,uuid,timestamptz,uuid,text,text,text,uuid,text,numeric,numeric,text,text,text) from public,anon,authenticated;
grant execute on function private.server_home_service_booking_submit(uuid,uuid,timestamptz,uuid,text,text,text,uuid,text,numeric,numeric,text,text,text) to service_role;
create function public.server_home_service_booking_submit(
 p_service uuid,p_staff uuid,p_start timestamptz,p_request_key uuid,p_name text,p_email text,p_phone text,p_auth_user uuid,
 p_address text,p_latitude numeric,p_longitude numeric,p_landmark text,p_instructions text,p_area_hint text
) returns jsonb language sql security invoker set search_path='' as $$
 select private.server_home_service_booking_submit(p_service,p_staff,p_start,p_request_key,p_name,p_email,p_phone,p_auth_user,p_address,p_latitude,p_longitude,p_landmark,p_instructions,p_area_hint);
$$;
revoke all on function public.server_home_service_booking_submit(uuid,uuid,timestamptz,uuid,text,text,text,uuid,text,numeric,numeric,text,text,text) from public,anon,authenticated;
grant execute on function public.server_home_service_booking_submit(uuid,uuid,timestamptz,uuid,text,text,text,uuid,text,numeric,numeric,text,text,text) to service_role;

-- Service writes stay behind the established MFA-gated catalog RPC.
create or replace function public.catalog_save_service(p_id uuid,p_values jsonb,p_currency text) returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid; business_enabled boolean; home_enabled boolean; fee bigint; before_minutes integer; after_minutes integer;
begin
 if not private.is_admin() then raise exception 'Admin with MFA required' using errcode='42501'; end if;
 perform private.lock_schedule();
 if not exists(select 1 from public.business_settings where currency=p_currency) then raise exception 'Configure business currency first or reload'; end if;
 business_enabled:=coalesce((p_values->>'supports_business_location')::boolean,true);
 home_enabled:=coalesce((p_values->>'supports_home_service')::boolean,false);
 fee:=coalesce((p_values->>'home_service_fee')::bigint,0); before_minutes:=coalesce((p_values->>'home_travel_before_minutes')::integer,0); after_minutes:=coalesce((p_values->>'home_travel_after_minutes')::integer,0);
 if not business_enabled and not home_enabled then raise exception 'At least one fulfillment mode must remain enabled'; end if;
 if fee<0 or fee>9007199254740991 or before_minutes not between 0 and 240 or after_minutes not between 0 and 240 then raise exception 'Invalid Home Service settings'; end if;
 if length(trim(p_values->>'name')) not between 1 and 200 or length(coalesce(p_values->>'description',''))>4000 or length(p_values->>'slug')>100 or p_values->>'slug' !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Invalid service'; end if;
 if p_id is null then
 insert into public.services(name,slug,category_id,description,price_amount,duration_minutes,buffer_before_minutes,buffer_after_minutes,payment_mode,deposit_amount,deposit_type,deposit_percent_bps,active,published,supports_business_location,supports_home_service,home_service_fee,home_travel_before_minutes,home_travel_after_minutes)
 values(trim(p_values->>'name'),p_values->>'slug',nullif(p_values->>'category_id','')::uuid,p_values->>'description',(p_values->>'price_amount')::bigint,(p_values->>'duration_minutes')::int,(p_values->>'buffer_before_minutes')::int,(p_values->>'buffer_after_minutes')::int,(p_values->>'payment_mode')::public.payment_mode,(p_values->>'deposit_amount')::bigint,p_values->>'deposit_type',(p_values->>'deposit_percent_bps')::int,(p_values->>'active')::boolean,(p_values->>'published')::boolean,business_enabled,home_enabled,fee,before_minutes,after_minutes) returning id into result;
 else
 update public.services set name=trim(p_values->>'name'),slug=p_values->>'slug',category_id=nullif(p_values->>'category_id','')::uuid,description=p_values->>'description',price_amount=(p_values->>'price_amount')::bigint,duration_minutes=(p_values->>'duration_minutes')::int,buffer_before_minutes=(p_values->>'buffer_before_minutes')::int,buffer_after_minutes=(p_values->>'buffer_after_minutes')::int,payment_mode=(p_values->>'payment_mode')::public.payment_mode,deposit_amount=(p_values->>'deposit_amount')::bigint,deposit_type=p_values->>'deposit_type',deposit_percent_bps=(p_values->>'deposit_percent_bps')::int,active=(p_values->>'active')::boolean,published=(p_values->>'published')::boolean,supports_business_location=business_enabled,supports_home_service=home_enabled,home_service_fee=fee,home_travel_before_minutes=before_minutes,home_travel_after_minutes=after_minutes where id=p_id returning id into result;
 if not found then raise exception 'Service not found'; end if;
 end if;
 if home_enabled then perform private.log_home_service_audit('home_service.service_config_changed','services',result,jsonb_build_object('home_service_enabled',true,'fee_minor_units',fee,'travel_before_minutes',before_minutes,'travel_after_minutes',after_minutes)); end if;
 return result;
end; $$;

create or replace function public.public_catalog() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('services',coalesce((select jsonb_agg(x) from (select s.id,s.name,s.slug,s.description,s.image_path,s.price_amount,s.duration_minutes,s.category_id,s.payment_mode,s.deposit_amount,s.deposit_type,s.deposit_percent_bps,s.supports_business_location,s.supports_home_service,s.home_service_fee
 from public.services s where s.active and s.published and (s.category_id is null or exists(select 1 from public.service_categories c where c.id=s.category_id and c.active and c.published)) order by s.name,s.id)x),'[]'),
 'staff',coalesce((select jsonb_agg(x) from (select s.id,s.display_name,s.slug,s.bio,s.photo_path from public.staff s where s.active and s.published and s.bookable order by s.display_name,s.id)x),'[]'),
 'assignments',coalesce((select jsonb_agg(jsonb_build_object('staff_id',ss.staff_id,'service_id',ss.service_id)) from public.staff_services ss join public.staff st on st.id=ss.staff_id join public.services s on s.id=ss.service_id where ss.active and st.active and st.published and st.bookable and s.active and s.published and(s.category_id is null or exists(select 1 from public.service_categories c where c.id=s.category_id and c.active and c.published))),'[]'));
$$;

comment on column public.appointments.fulfillment_mode is 'Immutable appointment fulfillment snapshot; never infer from an address.';
comment on column public.appointments.home_service_fee_snapshot is 'Home Service fee in minor currency units, included in total_amount at booking time.';

create trigger home_location_change_hint after insert or update or delete on public.appointment_home_locations
for each statement execute function private.broadcast_app_change();

create function public.admin_save_home_area(p_latitude numeric,p_longitude numeric,p_radius_km numeric)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Admin with MFA required' using errcode='42501'; end if;
 if (p_latitude is null)<>(p_longitude is null) or (p_latitude is not null and p_latitude not between -90 and 90) or (p_longitude is not null and p_longitude not between -180 and 180)
   or (p_radius_km is not null and p_radius_km not between 0.1 and 500) then raise exception 'Invalid Home Service area settings'; end if;
 if p_radius_km is not null and p_latitude is null then raise exception 'Set a business map pin before enabling radius enforcement'; end if;
 update public.business_settings set service_origin_latitude=p_latitude,service_origin_longitude=p_longitude,home_service_max_radius_km=p_radius_km,updated_at=now();
 perform private.log_home_service_audit('home_service.settings_changed','business_settings',null,jsonb_build_object('radius_enforced',p_radius_km is not null));
end; $$;
revoke all on function public.admin_save_home_area(numeric,numeric,numeric) from public,anon,authenticated;
grant execute on function public.admin_save_home_area(numeric,numeric,numeric) to authenticated;

create function private.log_home_service_audit(p_action text,p_entity_table text,p_entity_id uuid,p_details jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Admin with MFA required' using errcode='42501'; end if;
 insert into public.audit_logs(actor_id,action,entity_table,entity_id,details) values(auth.uid(),p_action,p_entity_table,p_entity_id,coalesce(p_details,'{}'::jsonb));
end; $$;
revoke all on function private.log_home_service_audit(text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.log_home_service_audit(text,text,uuid,jsonb) to authenticated;
