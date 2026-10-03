-- Phase 5: extend existing catalog and scheduling; preserve appointment snapshots.
alter table public.service_categories add column active boolean not null default true;
alter table public.services add column image_path text,
 add column deposit_type text not null default 'FIXED' check(deposit_type in ('FIXED','PERCENTAGE')),
 add column deposit_percent_bps integer check(deposit_percent_bps between 1 and 10000),
 add constraint deposit_configuration check((deposit_type='FIXED' and deposit_percent_bps is null) or (deposit_type='PERCENTAGE' and payment_mode='DEPOSIT' and deposit_percent_bps is not null));

create table private.staff_details (
 staff_id uuid primary key references public.staff(id) on delete restrict,
 full_name text not null check(length(trim(full_name)) between 2 and 200),
 email text check(length(email)<=254),phone text check(length(phone)<=40),
 updated_at timestamptz not null default now()
);
alter table private.staff_details enable row level security;
revoke all on private.staff_details from public,anon,authenticated;
grant select,insert,update on private.staff_details to authenticated;
grant all on private.staff_details to service_role;
create policy admin_read on private.staff_details for select to authenticated using((select private.is_admin()));
create policy admin_insert on private.staff_details for insert to authenticated with check((select private.is_admin()));
create policy admin_update on private.staff_details for update to authenticated using((select private.is_admin())) with check((select private.is_admin()));

create function private.resolve_service_deposit() returns trigger language plpgsql set search_path='' as $$
begin
 if new.deposit_type='PERCENTAGE' then
  new.deposit_amount:=ceil(new.price_amount::numeric*new.deposit_percent_bps/10000)::bigint;
 end if;
 return new;
end; $$;
revoke all on function private.resolve_service_deposit() from public,anon,authenticated;
create trigger resolve_service_deposit before insert or update on public.services for each row execute function private.resolve_service_deposit();

set search_path=public,extensions;
alter table public.staff_working_hours add constraint staff_hours_no_overlap exclude using gist
 (staff_id with =,weekday with =,numrange(extract(epoch from starts_at),extract(epoch from ends_at),'[)') with &&);
reset search_path;
drop trigger protect_existing_schedule on public.staff_working_hours;
create constraint trigger protect_existing_schedule after insert or update or delete on public.staff_working_hours
deferrable initially deferred for each row execute function private.protect_existing_schedule();

drop policy published_read on public.service_categories;
create policy published_read on public.service_categories for select to anon,authenticated using(published and active);
drop policy published_read on public.services;
create policy published_read on public.services for select to anon,authenticated using(published and active and
 (category_id is null or exists(select 1 from public.service_categories c where c.id=category_id and c.active and c.published)));

create function public.catalog_save_category(p_id uuid,p_values jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
 if not private.is_admin() then raise exception 'Admin with MFA required' using errcode='42501'; end if;
 perform private.lock_schedule();
 if length(trim(p_values->>'name')) not between 1 and 200 or p_values->>'slug' !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Invalid category'; end if;
 if p_id is null then
 insert into public.service_categories(name,slug,sort_order,active,published) values(trim(p_values->>'name'),p_values->>'slug',(p_values->>'sort_order')::int,(p_values->>'active')::boolean,(p_values->>'published')::boolean) returning id into result;
 else
 update public.service_categories set name=trim(p_values->>'name'),slug=p_values->>'slug',sort_order=(p_values->>'sort_order')::int,active=(p_values->>'active')::boolean,published=(p_values->>'published')::boolean where id=p_id returning id into result;
 if not found then raise exception 'Category not found'; end if;
 end if;
 return result;
end; $$;

create function public.catalog_save_service(p_id uuid,p_values jsonb,p_currency text) returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
 if not private.is_admin() then raise exception 'Admin with MFA required' using errcode='42501'; end if;
 perform private.lock_schedule();
 if not exists(select 1 from public.business_settings where currency=p_currency) then raise exception 'Configure business currency first or reload'; end if;
 if length(trim(p_values->>'name')) not between 1 and 200 or length(coalesce(p_values->>'description',''))>4000 or length(p_values->>'slug')>100 or p_values->>'slug' !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Invalid service'; end if;
 if p_id is null then
 insert into public.services(name,slug,category_id,description,price_amount,duration_minutes,buffer_before_minutes,buffer_after_minutes,payment_mode,deposit_amount,deposit_type,deposit_percent_bps,active,published)
 values(trim(p_values->>'name'),p_values->>'slug',nullif(p_values->>'category_id','')::uuid,p_values->>'description',(p_values->>'price_amount')::bigint,(p_values->>'duration_minutes')::int,(p_values->>'buffer_before_minutes')::int,(p_values->>'buffer_after_minutes')::int,(p_values->>'payment_mode')::public.payment_mode,(p_values->>'deposit_amount')::bigint,p_values->>'deposit_type',(p_values->>'deposit_percent_bps')::int,(p_values->>'active')::boolean,(p_values->>'published')::boolean) returning id into result;
 else
 update public.services set name=trim(p_values->>'name'),slug=p_values->>'slug',category_id=nullif(p_values->>'category_id','')::uuid,description=p_values->>'description',price_amount=(p_values->>'price_amount')::bigint,duration_minutes=(p_values->>'duration_minutes')::int,buffer_before_minutes=(p_values->>'buffer_before_minutes')::int,buffer_after_minutes=(p_values->>'buffer_after_minutes')::int,payment_mode=(p_values->>'payment_mode')::public.payment_mode,deposit_amount=(p_values->>'deposit_amount')::bigint,deposit_type=p_values->>'deposit_type',deposit_percent_bps=(p_values->>'deposit_percent_bps')::int,active=(p_values->>'active')::boolean,published=(p_values->>'published')::boolean where id=p_id returning id into result;
 if not found then raise exception 'Service not found'; end if;
 end if;
 return result;
end; $$;

create function public.catalog_save_staff(p_id uuid,p_values jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
 if not private.is_admin() then raise exception 'Admin with MFA required' using errcode='42501'; end if;
 perform private.lock_schedule();
 if length(trim(p_values->>'display_name')) not between 2 and 200 or length(coalesce(p_values->>'bio',''))>2000 or length(p_values->>'slug')>100 or p_values->>'slug' !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Invalid staff profile'; end if;
 if p_id is null then
 insert into public.staff(display_name,slug,bio,active,published,bookable) values(trim(p_values->>'display_name'),p_values->>'slug',p_values->>'bio',(p_values->>'active')::boolean,(p_values->>'published')::boolean,(p_values->>'bookable')::boolean) returning id into result;
 else
 update public.staff set display_name=trim(p_values->>'display_name'),slug=p_values->>'slug',bio=p_values->>'bio',active=(p_values->>'active')::boolean,published=(p_values->>'published')::boolean,bookable=(p_values->>'bookable')::boolean where id=p_id returning id into result;
 if not found then raise exception 'Staff not found'; end if;
 end if;
 insert into private.staff_details(staff_id,full_name,email,phone) values(result,trim(p_values->>'full_name'),nullif(p_values->>'email',''),nullif(p_values->>'phone',''))
 on conflict(staff_id) do update set full_name=excluded.full_name,email=excluded.email,phone=excluded.phone,updated_at=now();
 return result;
end; $$;

create function public.catalog_assign_services(p_staff uuid,p_services jsonb) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Admin with MFA required' using errcode='42501'; end if;
 perform private.lock_schedule();
 if p_services is null or jsonb_typeof(p_services)<>'array' or jsonb_array_length(p_services)>1000 then raise exception 'Invalid assignments'; end if;
 if not exists(select 1 from public.staff where id=p_staff) then raise exception 'Staff not found'; end if;
 update public.staff_services set active=false where staff_id=p_staff;
 insert into public.staff_services(staff_id,service_id,active)
 select p_staff,value::uuid,true from jsonb_array_elements_text(p_services) on conflict(staff_id,service_id) do update set active=true;
end; $$;

create function public.catalog_save_staff_hours(p_staff uuid,p_intervals jsonb) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Admin with MFA required' using errcode='42501'; end if;
 perform private.lock_schedule();
 if p_intervals is null or jsonb_typeof(p_intervals)<>'array' or jsonb_array_length(p_intervals)>28 then raise exception 'Invalid hours'; end if;
 if not exists(select 1 from public.staff where id=p_staff) then raise exception 'Staff not found'; end if;
 delete from public.staff_working_hours where staff_id=p_staff;
 insert into public.staff_working_hours(staff_id,weekday,starts_at,ends_at) select p_staff,weekday,opens_at,closes_at from jsonb_to_recordset(p_intervals) x(weekday smallint,opens_at time,closes_at time);
end; $$;

create function public.catalog_save_exception(p_staff uuid,p_kind public.schedule_exception_kind,p_start timestamp,p_end timestamp,p_reason text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Admin with MFA required' using errcode='42501'; end if;
 perform private.lock_schedule();
 if p_start is null or p_end is null or p_start>=p_end or length(trim(p_reason)) not between 1 and 500 then raise exception 'Invalid exception'; end if;
 insert into public.staff_schedule_exceptions(staff_id,kind,starts_at,ends_at,reason) values(p_staff,p_kind,public.admin_local_instant(p_start),public.admin_local_instant(p_end),trim(p_reason));
end; $$;

-- No grants on private staff contacts to anon; public data always selects a safe field list.
create function public.public_catalog() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('services',coalesce((select jsonb_agg(x) from (select s.id,s.name,s.slug,s.description,s.image_path,s.price_amount,s.duration_minutes,s.category_id,s.payment_mode,s.deposit_amount
 from public.services s where s.active and s.published and (s.category_id is null or exists(select 1 from public.service_categories c where c.id=s.category_id and c.active and c.published)) order by s.name,s.id)x),'[]'),
 'staff',coalesce((select jsonb_agg(x) from (select s.id,s.display_name,s.slug,s.bio,s.photo_path from public.staff s where s.active and s.published and s.bookable order by s.display_name,s.id)x),'[]'),
 'assignments',coalesce((select jsonb_agg(jsonb_build_object('staff_id',ss.staff_id,'service_id',ss.service_id)) from public.staff_services ss
 join public.staff st on st.id=ss.staff_id join public.services s on s.id=ss.service_id where ss.active and st.active and st.published and st.bookable and s.active and s.published
 and(s.category_id is null or exists(select 1 from public.service_categories c where c.id=s.category_id and c.active and c.published))),'[]'));
$$;

create function public.catalog_data(p_kind text,p_id uuid default null,p_query text default '',p_category uuid default null,p_active text default '',p_page integer default 1)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; rows_json jsonb; total bigint;
begin
 if not private.is_admin() then raise exception 'Admin with MFA required' using errcode='42501'; end if;
 if p_page is null or p_page not between 1 and 10000 or length(p_query)>100 or p_active not in ('','true','false') then raise exception 'Invalid filters'; end if;
 result:=jsonb_build_object('page',p_page,'business',(select to_jsonb(b) from public.business_settings b),
 'categories',coalesce((select jsonb_agg(c order by sort_order,name,id) from public.service_categories c),'[]'),
 'service_options',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'active',active) order by name,id) from public.services),'[]'),
 'staff_options',coalesce((select jsonb_agg(jsonb_build_object('id',id,'display_name',display_name,'active',active) order by display_name,id) from public.staff),'[]'));
 if p_kind='services' then
 with matched as(select * from public.services s where(p_id is null or id=p_id) and(p_category is null or category_id=p_category) and(p_active='' or active=p_active::boolean) and(p_query='' or position(lower(p_query) in lower(name||' '||slug))>0)),
 paged as(select * from matched order by name,id limit 25 offset(p_page-1)*25)
 select coalesce(jsonb_agg(paged),'[]'),(select count(*) from matched) into rows_json,total from paged;
 result:=result||jsonb_build_object('services',rows_json,'total',total,
 'assignments',coalesce((select jsonb_agg(jsonb_build_object('staff_id',staff_id,'service_id',service_id)) from public.staff_services where active and service_id=p_id),'[]'));
 elsif p_kind='staff' then
 with matched as(select s.id,s.display_name,s.slug,s.bio,s.photo_path,s.active,s.published,s.bookable,d.full_name,d.email,d.phone from public.staff s left join private.staff_details d on d.staff_id=s.id
 where(p_id is null or s.id=p_id) and(p_active='' or s.active=p_active::boolean) and(p_query='' or position(lower(p_query) in lower(s.display_name||' '||coalesce(d.full_name,'')))>0)),
 paged as(select * from matched order by display_name,id limit 25 offset(p_page-1)*25)
 select coalesce(jsonb_agg(paged),'[]'),(select count(*) from matched) into rows_json,total from paged;
 result:=result||jsonb_build_object('staff',rows_json,'total',total,
 'assigned_services',coalesce((select jsonb_agg(service_id) from public.staff_services where staff_id=p_id and active),'[]'),
 'hours',coalesce((select jsonb_agg(x order by weekday,starts_at) from public.staff_working_hours x where staff_id=p_id),'[]'),
 'exceptions',coalesce((select jsonb_agg(x) from(select * from public.staff_schedule_exceptions where staff_id=p_id order by starts_at desc,id limit 100)x),'[]'),
 'upcoming',coalesce((select jsonb_agg(x) from(select a.id,a.starts_at,a.ends_at,a.state,c.display_name customer_name,s.display_name staff_name,i.service_name_snapshot service_name
 from public.appointments a join public.customers c on c.id=a.customer_id join public.staff s on s.id=a.staff_id left join public.appointment_items i on i.appointment_id=a.id
 where a.staff_id=p_id and a.starts_at>=now() and a.state in('PENDING','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS') order by a.starts_at,a.id limit 25)x),'[]'));
 else raise exception 'Unknown catalog area'; end if;
 return result;
end; $$;

create function public.my_staff_workspace() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare staff_id_value uuid; tz text; d date; result jsonb;
begin
 select id into staff_id_value from public.staff where private.is_assigned_staff(id);
 if auth.uid() is null or staff_id_value is null then raise exception 'Active assigned staff required' using errcode='42501'; end if;
 -- Published business settings might not exist yet; timezone is exposed separately below via narrow helper.
 tz:=private.business_timezone(); d:=(now() at time zone tz)::date;
 result:=jsonb_build_object('timezone',tz,'date',d,'staff_id',staff_id_value,
 'hours',coalesce((select jsonb_agg(x order by weekday,starts_at) from public.staff_working_hours x where staff_id=staff_id_value),'[]'),
 'business_hours',coalesce((select jsonb_agg(x order by weekday,opens_at) from public.business_hours x),'[]'),
 'exceptions',coalesce((select jsonb_agg(x) from(select id,kind,starts_at,ends_at,reason from public.staff_schedule_exceptions where staff_id=staff_id_value and ends_at>=now() order by starts_at,id limit 100)x),'[]'),
 'stats',(select jsonb_build_object('today',count(*) filter(where(starts_at at time zone tz)::date=d),'pending',count(*) filter(where state='PENDING'),'confirmed',count(*) filter(where state='CONFIRMED'),'upcoming',count(*) filter(where starts_at>=now() and state in('AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS'))) from public.appointments where staff_id=staff_id_value));
 -- Independently bound each view so stale pending requests cannot hide today's work.
 with visible as(select a.id,a.starts_at,a.ends_at,a.state,c.display_name customer_name,i.service_name_snapshot service_name from public.appointments a join public.customers c on c.id=a.customer_id left join public.appointment_items i on i.appointment_id=a.id where a.staff_id=staff_id_value)
 select result||jsonb_build_object(
 'today',coalesce((select jsonb_agg(x) from(select * from visible where(starts_at at time zone tz)::date=d order by starts_at,id limit 100)x),'[]'),
 'pending',coalesce((select jsonb_agg(x) from(select * from visible where state='PENDING' order by starts_at,id limit 100)x),'[]'),
 'confirmed',coalesce((select jsonb_agg(x) from(select * from visible where state='CONFIRMED' order by starts_at,id limit 100)x),'[]'),
 'upcoming',coalesce((select jsonb_agg(x) from(select * from visible where starts_at>=now() and state in('CONFIRMED','AWAITING_PAYMENT','CHECKED_IN','IN_PROGRESS') order by starts_at,id limit 100)x),'[]')) into result;
 return result;
end; $$;

create function private.business_timezone() returns text language sql stable security definer set search_path='' as $$ select coalesce((select timezone from public.business_settings),'UTC'); $$;
revoke all on function private.business_timezone() from public,anon,authenticated;
grant execute on function private.business_timezone() to authenticated;

revoke all on function public.catalog_save_category(uuid,jsonb),public.catalog_save_service(uuid,jsonb,text),public.catalog_save_staff(uuid,jsonb),public.catalog_assign_services(uuid,jsonb),public.catalog_save_staff_hours(uuid,jsonb),public.catalog_save_exception(uuid,public.schedule_exception_kind,timestamp,timestamp,text),public.catalog_data(text,uuid,text,uuid,text,integer),public.my_staff_workspace(),public.public_catalog() from public,anon,authenticated;
grant execute on function public.catalog_save_category(uuid,jsonb),public.catalog_save_service(uuid,jsonb,text),public.catalog_save_staff(uuid,jsonb),public.catalog_assign_services(uuid,jsonb),public.catalog_save_staff_hours(uuid,jsonb),public.catalog_save_exception(uuid,public.schedule_exception_kind,timestamp,timestamp,text),public.catalog_data(text,uuid,text,uuid,text,integer),public.my_staff_workspace() to authenticated;
grant execute on function public.public_catalog() to anon,authenticated;

-- Preserve the full existing lifecycle; only add inactive-category eligibility checks.
create or replace function private.request_appointment(p_customer uuid,p_staff uuid,p_service uuid,p_start timestamptz,p_request_key uuid)
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

create or replace function private.accept_appointment(p_appointment uuid) returns public.appointment_state
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
 where i.appointment_id=a.id and s.active and ss.active and st.active and st.bookable
 and (s.category_id is null or exists(select 1 from public.service_categories c where c.id=s.category_id and c.active)))
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
create or replace function private.link_staff_account(p_user uuid,p_name text,p_slug text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
 if auth.uid() is null or not private.is_owner() then raise exception 'Owner with MFA required'; end if;
 if p_name is null or length(trim(p_name)) not between 2 and 200 or p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug)>100 then raise exception 'Invalid staff details'; end if;
 perform private.lock_schedule();
 if not exists(select 1 from auth.users where id=p_user) or not exists(select 1 from public.profiles where auth_user_id=p_user and disabled_at is null)
 then raise exception 'Active Auth account required'; end if;
 if exists(select 1 from public.user_roles where auth_user_id=p_user and role in ('OWNER','ADMIN')) then raise exception 'Use a dedicated staff account'; end if;
 select id into result from public.staff where auth_user_id=p_user;
 if result is not null then
   if not exists(select 1 from public.staff where id=result and active and slug=p_slug) then raise exception 'Existing staff record requires review'; end if;
 else
   select id into result from public.staff where slug=p_slug and auth_user_id is null and active for update;
   if result is not null then
     update public.staff set auth_user_id=p_user where id=result;
   else
     insert into public.staff(auth_user_id,display_name,slug,active,published,bookable)
     values(p_user,trim(p_name),p_slug,true,false,false) returning id into result;
   end if;
 end if;
 insert into public.user_roles(auth_user_id,role) values(p_user,'STAFF') on conflict(auth_user_id,role) do nothing;
 update public.profiles set display_name=trim(p_name) where auth_user_id=p_user;
 return result;
end; $$;


