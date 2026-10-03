-- Public website projection and trusted registered/guest booking boundary.
create extension if not exists pgcrypto with schema extensions;
create function private.public_website_data() returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object(
  'business', case when b.published then jsonb_build_object('name',b.name,'description',b.description,'timezone',b.timezone,'currency',b.currency,'contact_email',b.contact_email,'contact_phone',b.contact_phone,'address',b.address,'guest_booking_enabled',b.guest_booking_enabled,'customer_registration_enabled',b.customer_registration_enabled) else null end,
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
revoke all on function private.public_website_data() from public,anon,authenticated;
create function public.public_website_data() returns jsonb language sql stable security invoker set search_path='' as $$ select private.public_website_data(); $$;
revoke all on function public.public_website_data() from public,anon,authenticated;
grant usage on schema private to anon,authenticated;
grant execute on function private.public_website_data() to anon,authenticated;
grant execute on function public.public_website_data() to anon,authenticated;

-- Permit the following private guest handler to reuse the established atomic request
-- operation. Anon cannot execute this private function or its older public wrapper.
create or replace function private.request_appointment(p_customer uuid,p_staff uuid,p_service uuid,p_start timestamptz,p_request_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare s public.services; pol public.booking_policy_versions; b public.business_settings; a public.appointments;
 result uuid; finish timestamptz; occupied tstzrange; local_start timestamp;
begin
 if not (private.owns_customer(p_customer) or private.is_admin()
  or (auth.uid() is null and current_setting('role',true)='service_role')
  or (auth.uid() is null and current_setting('role',true)='anon' and exists(select 1 from public.business_settings x where x.guest_booking_enabled) and exists(select 1 from public.customers c where c.id=p_customer and c.auth_user_id is null)))
 then raise exception 'Not authorized'; end if;
 perform private.lock_schedule();
 select * into a from public.appointments where request_key=p_request_key;
 if found then
  if a.customer_id<>p_customer or a.staff_id<>p_staff or a.starts_at<>p_start or not exists(select 1 from public.appointment_items where appointment_id=a.id and service_id=p_service) then raise exception 'Idempotency key reused with different booking'; end if;
  return a.id;
 end if;
 select * into s from public.services where id=p_service and active and published and (category_id is null or exists(select 1 from public.service_categories c where c.id=category_id and c.active and c.published));
 if not found then raise exception 'Service is unavailable'; end if;
 if not exists(select 1 from public.staff st join public.staff_services ss on ss.staff_id=st.id where st.id=p_staff and st.active and st.bookable and st.published and ss.service_id=p_service and ss.active) then raise exception 'Staff cannot provide service'; end if;
 select * into pol from public.booking_policy_versions where published order by version desc limit 1;
 if not found then raise exception 'Published booking policy required'; end if;
 select * into b from public.business_settings limit 1;
 if not found then raise exception 'Business settings required'; end if;
 local_start:=p_start at time zone b.timezone;
 if not exists(select 1 from public.business_hours h where h.weekday=extract(dow from local_start)::integer and h.opens_at<=local_start::time and h.closes_at>local_start::time and mod(extract(epoch from(local_start::time-h.opens_at))::integer,b.scheduling_interval_minutes*60)=0) then raise exception 'Start time is no longer on the configured schedule interval'; end if;
 if not private.valid_business_local_time(local_start,b.timezone) then raise exception 'Ambiguous or invalid local start time'; end if;
 if p_start<clock_timestamp()+make_interval(mins=>pol.minimum_notice_minutes) or p_start>clock_timestamp()+make_interval(days=>pol.maximum_advance_days) then raise exception 'Outside booking window'; end if;
 finish:=p_start+make_interval(mins=>s.duration_minutes);
 occupied:=tstzrange(p_start-make_interval(mins=>s.buffer_before_minutes),finish+make_interval(mins=>s.buffer_after_minutes),'[)');
 if not private.valid_business_local_time(lower(occupied) at time zone b.timezone,b.timezone) or not private.valid_business_local_time(upper(occupied) at time zone b.timezone,b.timezone) then raise exception 'Ambiguous or invalid local occupied interval'; end if;
 perform private.validate_schedule(p_staff,lower(occupied),upper(occupied)); perform private.expire_due_payments();
 if exists(select 1 from public.appointments where staff_id=p_staff and occupied_range&&occupied and state in('ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW')) then raise exception 'Slot already reserved'; end if;
 insert into public.appointments(customer_id,staff_id,policy_version_id,request_key,starts_at,ends_at,buffer_before_minutes,buffer_after_minutes,occupied_range,currency,total_amount,payment_mode_snapshot,required_payment_amount)
 values(p_customer,p_staff,pol.id,p_request_key,p_start,finish,s.buffer_before_minutes,s.buffer_after_minutes,occupied,b.currency,s.price_amount,s.payment_mode,case s.payment_mode when 'PAY_AT_BUSINESS' then 0 when 'FULL_PAYMENT' then s.price_amount else s.deposit_amount end) returning id into result;
 insert into public.appointment_items(appointment_id,service_id,service_name_snapshot,price_amount,duration_minutes,buffer_before_minutes,buffer_after_minutes) values(result,s.id,s.name,s.price_amount,s.duration_minutes,s.buffer_before_minutes,s.buffer_after_minutes);
 return result;
end; $$;

-- `p_staff = NULL` asks the Phase 6 engine to select its deterministic least-loaded
-- eligible staff member. PENDING is still non-blocking and approval remains required.
create function private.public_booking_submit(
 p_service uuid,p_staff uuid,p_start timestamptz,p_request_key uuid,
 p_name text,p_email text,p_phone text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.business_settings; c public.customers; existing public.appointments; result uuid; chosen uuid;
 availability jsonb; slot jsonb; local_day date; normalized_email text; normalized_phone text; guest_token text; token_hash text;
begin
 if p_service is null or p_start is null or p_request_key is null then raise exception 'Invalid booking request'; end if;
 perform private.lock_schedule();
 select * into b from public.business_settings limit 1;
 if not found or not b.published then raise exception 'Online booking is unavailable'; end if;
 select * into existing from public.appointments a where a.request_key=p_request_key;
 if found then
   if auth.uid() is null then
     if p_name is null or length(trim(p_name)) not between 2 and 200 or p_email is null or length(trim(p_email))>254 or trim(p_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Valid guest contact information is required'; end if;
     normalized_email:=lower(trim(p_email));
     if (p_staff is not null and existing.staff_id<>p_staff) or existing.starts_at<>p_start
       or not exists(select 1 from public.appointments a join public.customers x on x.id=a.customer_id join public.appointment_items i on i.appointment_id=a.id where a.id=existing.id and x.auth_user_id is null and x.display_name=trim(p_name) and x.email=normalized_email and i.service_id=p_service) then raise exception 'Idempotency key reused with different booking'; end if;
     guest_token:=translate(rtrim(encode(extensions.gen_random_bytes(32),'base64'),'='),'+/','-_');token_hash:=encode(extensions.digest(convert_to(guest_token,'UTF8'),'sha256'),'hex');
     insert into public.guest_access_tokens(appointment_id,token_hash,scope,expires_at) values(existing.id,token_hash,'VIEW',clock_timestamp()+interval '30 days');
     return jsonb_build_object('appointment_id',existing.id,'guest_token',guest_token);
   else
     select * into c from public.customers where auth_user_id=auth.uid();
     if not found or existing.customer_id<>c.id or existing.starts_at<>p_start or (p_staff is not null and existing.staff_id<>p_staff)
       or not exists(select 1 from public.appointment_items i where i.appointment_id=existing.id and i.service_id=p_service) then raise exception 'Idempotency key reused with different booking'; end if;
     return jsonb_build_object('appointment_id',existing.id,'guest_token',null);
   end if;
 end if;
 local_day := (p_start at time zone b.timezone)::date;
 availability := private.calculate_availability(p_service,local_day,p_staff,false);
 select x into slot from jsonb_array_elements(coalesce(availability->'slots','[]'::jsonb)) x
 where x->>'starts_at'=p_start::text or (x->>'starts_at')::timestamptz=p_start limit 1;
 if slot is null then raise exception 'This time is no longer available'; end if;
 chosen := coalesce(p_staff,nullif(slot->>'assigned_staff_id','')::uuid);
 if chosen is null or not exists(select 1 from jsonb_array_elements(coalesce(slot->'staff','[]'::jsonb)) x where x->>'id'=chosen::text) then
   raise exception 'No eligible staff member is available';
 end if;

 if auth.uid() is null then
   if not b.guest_booking_enabled then raise exception 'Guest booking is disabled'; end if;
   if p_name is null or length(trim(p_name)) not between 2 and 200
      or p_email is null or length(trim(p_email))>254 or trim(p_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      or (p_phone is not null and trim(p_phone)<>'' and trim(p_phone) !~ '^\+?[0-9 ()-]{7,25}$') then raise exception 'Valid guest contact information is required'; end if;
   guest_token:=translate(rtrim(encode(extensions.gen_random_bytes(32),'base64'),'='),'+/','-_');
   token_hash:=encode(extensions.digest(convert_to(guest_token,'UTF8'),'sha256'),'hex');
   normalized_email:=lower(trim(p_email)); normalized_phone:=nullif(trim(p_phone),'');
   select a.id into result from public.appointments a where a.request_key=p_request_key;
   if result is not null then
     if not exists(select 1 from public.appointments a join public.customers x on x.id=a.customer_id join public.appointment_items i on i.appointment_id=a.id where a.id=result and a.staff_id=chosen and a.starts_at=p_start and x.display_name=trim(p_name) and x.email=normalized_email and i.service_id=p_service) then raise exception 'Idempotency key reused'; end if;
     insert into public.guest_access_tokens(appointment_id,token_hash,scope,expires_at) values(result,token_hash,'VIEW',clock_timestamp()+interval '30 days');
     return jsonb_build_object('appointment_id',result,'guest_token',guest_token);
   end if;
   insert into public.customers(display_name,email,phone) values(trim(p_name),normalized_email,normalized_phone) returning * into c;
 else
   select * into c from public.customers where auth_user_id=auth.uid();
   if not found then raise exception 'Complete your customer profile before booking'; end if;
   select lower(u.email) into normalized_email from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null;
   if normalized_email is null then raise exception 'Verify your account email before booking'; end if;
   if p_name is not null and length(trim(p_name)) between 2 and 200 then c.display_name:=trim(p_name); end if;
   c.email:=normalized_email;
   if p_phone is not null then if trim(p_phone)<>'' and trim(p_phone) !~ '^\+?[0-9 ()-]{7,25}$' then raise exception 'Enter a valid mobile number'; end if; c.phone:=nullif(trim(p_phone),''); end if;
   if c.email is null and c.phone is null then raise exception 'An email address or mobile number is required'; end if;
   update public.customers set display_name=c.display_name,email=c.email,phone=c.phone where id=c.id;
 end if;

 result:=private.request_appointment(c.id,chosen,p_service,p_start,p_request_key);
 if auth.uid() is null then
   insert into public.guest_access_tokens(appointment_id,token_hash,scope,expires_at)
   values(result,token_hash,'VIEW',clock_timestamp()+interval '30 days');
 end if;
 return jsonb_build_object('appointment_id',result,'guest_token',guest_token);
end; $$;
revoke all on function private.public_booking_submit(uuid,uuid,timestamptz,uuid,text,text,text) from public,anon,authenticated;
create function public.public_booking_submit(p_service uuid,p_staff uuid,p_start timestamptz,p_request_key uuid,p_name text,p_email text,p_phone text)
returns jsonb language sql security invoker set search_path='' as $$ select private.public_booking_submit(p_service,p_staff,p_start,p_request_key,p_name,p_email,p_phone); $$;
revoke all on function public.public_booking_submit(uuid,uuid,timestamptz,uuid,text,text,text) from public;
grant execute on function public.public_booking_submit(uuid,uuid,timestamptz,uuid,text,text,text) to anon,authenticated;
grant execute on function private.public_booking_submit(uuid,uuid,timestamptz,uuid,text,text,text) to anon,authenticated;

-- Possession of a high-entropy token (stored hashed) is required; appointment UUIDs
-- alone never authorize access. The response deliberately projects customer-safe fields.
create function private.guest_appointment_by_token(p_token_hash text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',a.id,'reference',left(replace(a.id::text,'-',''),12),'state',a.state,'starts_at',a.starts_at,'ends_at',a.ends_at,'currency',a.currency,'total_amount',a.total_amount,'payment_mode',a.payment_mode_snapshot,'required_payment_amount',a.required_payment_amount,'payment_due_at',a.payment_due_at,'customer_name',c.display_name,'customer_email',c.email,'customer_phone',c.phone,'staff_name',s.display_name,'service_name',i.service_name_snapshot,'duration_minutes',i.duration_minutes,'timezone',b.timezone)
 from public.guest_access_tokens t join public.appointments a on a.id=t.appointment_id join public.customers c on c.id=a.customer_id join public.staff s on s.id=a.staff_id join public.appointment_items i on i.appointment_id=a.id cross join public.business_settings b
 where t.token_hash=p_token_hash and t.scope='VIEW' and t.consumed_at is null and t.revoked_at is null and t.expires_at>clock_timestamp() limit 1;
$$;
revoke all on function private.guest_appointment_by_token(text) from public,anon,authenticated;
create function public.guest_appointment_by_token(p_token_hash text) returns jsonb language sql security invoker set search_path='' as $$ select private.guest_appointment_by_token(p_token_hash); $$;
revoke all on function public.guest_appointment_by_token(text) from public;
grant execute on function public.guest_appointment_by_token(text) to anon,authenticated;
grant execute on function private.guest_appointment_by_token(text) to anon,authenticated;

