-- Phase 4: additive business configuration and RLS-respecting admin reads.
set search_path = public, extensions;
alter table public.business_settings
 add column description text not null default '' check (length(description)<=4000),
 add column scheduling_interval_minutes integer not null default 15 check (scheduling_interval_minutes between 5 and 120),
 add column default_buffer_minutes integer not null default 0 check (default_buffer_minutes between 0 and 240),
 add column require_staff_approval boolean not null default true check (require_staff_approval),
 add column guest_booking_enabled boolean not null default true,
 add column customer_registration_enabled boolean not null default true;

-- Validate the final weekly schedule, allowing an atomic replace without a
-- transient empty schedule invalidating reservations. Direct writes also check at commit.
drop trigger protect_existing_schedule on public.business_hours;
create constraint trigger protect_existing_schedule after insert or update or delete on public.business_hours
deferrable initially deferred for each row execute function private.protect_existing_schedule();
alter table public.business_hours add constraint business_hours_no_overlap exclude using gist
 (weekday with =, numrange(extract(epoch from opens_at),extract(epoch from closes_at),'[)') with &&);
reset search_path;

create function public.admin_save_settings(p_values jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare b public.business_settings; pol public.booking_policy_versions;
begin
 if not private.is_admin() then raise exception 'Admin with MFA required' using errcode='42501'; end if;
 perform private.lock_schedule();
 select * into b from public.business_settings;
 if nullif(p_values->>'expected_updated_at','')::timestamptz is distinct from b.updated_at
 then raise exception 'Settings changed; reload before saving' using errcode='40001'; end if;
 if length(trim(p_values->>'name')) not between 1 and 200
 or length(coalesce(p_values->>'contact_email',''))>254
 or length(coalesce(p_values->>'contact_phone',''))>40
 or length(coalesce(p_values->>'address',''))>1000
 or length(trim(p_values->>'terms')) not between 1 and 10000
 then raise exception 'Invalid business details' using errcode='22023'; end if;
 insert into public.business_settings(name,description,contact_email,contact_phone,address,timezone,currency,
 scheduling_interval_minutes,default_buffer_minutes,guest_booking_enabled,customer_registration_enabled,require_staff_approval)
 values(trim(p_values->>'name'),p_values->>'description',nullif(p_values->>'contact_email',''),nullif(p_values->>'contact_phone',''),nullif(p_values->>'address',''),
 p_values->>'timezone',p_values->>'currency',(p_values->>'scheduling_interval_minutes')::int,(p_values->>'default_buffer_minutes')::int,
 (p_values->>'guest_booking_enabled')::boolean,(p_values->>'customer_registration_enabled')::boolean,(p_values->>'require_staff_approval')::boolean)
 on conflict(singleton) do update set name=excluded.name,description=excluded.description,contact_email=excluded.contact_email,
 contact_phone=excluded.contact_phone,address=excluded.address,timezone=excluded.timezone,currency=excluded.currency,
 scheduling_interval_minutes=excluded.scheduling_interval_minutes,default_buffer_minutes=excluded.default_buffer_minutes,
 guest_booking_enabled=excluded.guest_booking_enabled,customer_registration_enabled=excluded.customer_registration_enabled,
 require_staff_approval=excluded.require_staff_approval;
 select * into pol from public.booking_policy_versions where published order by version desc limit 1;
 if pol.id is null or (pol.payment_window_minutes,pol.minimum_notice_minutes,pol.maximum_advance_days,pol.terms)
 is distinct from ((p_values->>'payment_window_minutes')::int,(p_values->>'minimum_notice_minutes')::int,(p_values->>'maximum_advance_days')::int,p_values->>'terms') then
 insert into public.booking_policy_versions(version,payment_window_minutes,minimum_notice_minutes,maximum_advance_days,cancellation_notice_minutes,no_show_grace_minutes,terms,published)
 values((select coalesce(max(version),0)+1 from public.booking_policy_versions),(p_values->>'payment_window_minutes')::int,
 (p_values->>'minimum_notice_minutes')::int,(p_values->>'maximum_advance_days')::int,coalesce(pol.cancellation_notice_minutes,1440),
 coalesce(pol.no_show_grace_minutes,15),p_values->>'terms',true);
 end if;
end; $$;

create function public.admin_save_hours(p_intervals jsonb) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Admin with MFA required' using errcode='42501'; end if;
 if jsonb_typeof(p_intervals)<>'array' or jsonb_array_length(p_intervals)>28 then raise exception 'Invalid hours'; end if;
 perform private.lock_schedule();
 delete from public.business_hours;
 insert into public.business_hours(weekday,opens_at,closes_at)
 select weekday,opens_at,closes_at from jsonb_to_recordset(p_intervals) as x(weekday smallint,opens_at time,closes_at time);
end; $$;

-- Convert wall times in the configured business zone, never the browser/server zone.
-- Reject DST gaps and repeated wall times rather than silently choosing an offset.
create function public.admin_local_instant(p_local timestamp) returns timestamptz language plpgsql stable security invoker set search_path='' as $$
declare tz text; instant timestamptz;
begin
 if not private.is_admin() then raise exception 'Admin with MFA required' using errcode='42501'; end if;
 select timezone into tz from public.business_settings;
 if tz is null then raise exception 'Configure business settings first'; end if;
 instant:=p_local at time zone tz;
 if p_local is null or not isfinite(p_local) or instant at time zone tz <> p_local
 or exists(select 1 from generate_series(-180,180) m where m<>0 and (instant+make_interval(mins=>m)) at time zone tz=p_local)
 then raise exception 'Invalid or ambiguous local time; choose another time' using errcode='22023'; end if;
 return instant;
end; $$;

create function public.admin_save_closure(p_date date,p_full_day boolean,p_start time,p_end time,p_reason text) returns void language plpgsql security invoker set search_path='' as $$
declare s timestamptz; e timestamptz;
begin
 if not private.is_admin() then raise exception 'Admin with MFA required' using errcode='42501'; end if;
 perform private.lock_schedule();
 if p_date is null or not isfinite(p_date) or length(trim(p_reason)) not between 1 and 500
 or (not p_full_day and (p_start is null or p_end is null or p_end<=p_start)) then raise exception 'Invalid closure'; end if;
 s:=public.admin_local_instant(p_date + case when p_full_day then time '00:00' else p_start end);
 e:=public.admin_local_instant(case when p_full_day then (p_date+1)::timestamp else p_date+p_end end);
 insert into public.business_closures(starts_at,ends_at,public_reason) values(s,e,trim(p_reason));
end; $$;

create function public.admin_save_announcement(p_id uuid,p_title text,p_body text,p_published boolean,p_start timestamp,p_end timestamp) returns void language plpgsql security invoker set search_path='' as $$
declare s timestamptz; e timestamptz;
begin
 if not private.is_admin() then raise exception 'Admin with MFA required' using errcode='42501'; end if;
 perform private.lock_schedule();
 if length(trim(p_title)) not between 1 and 200 or length(trim(p_body)) not between 1 and 10000 then raise exception 'Invalid announcement'; end if;
 s:=case when p_start is null then now() else public.admin_local_instant(p_start) end;
 e:=case when p_end is null then null else public.admin_local_instant(p_end) end;
 if p_id is null then
 insert into public.announcements(title,body,published,starts_at,ends_at) values(trim(p_title),trim(p_body),p_published,s,e);
 else
 update public.announcements set title=trim(p_title),body=trim(p_body),published=p_published,starts_at=s,ends_at=e where id=p_id;
 if not found then raise exception 'Announcement not found'; end if;
 end if;
end; $$;

-- Only this public boolean is returned even while business details are unpublished.
create function private.registration_enabled() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select customer_registration_enabled from public.business_settings),true);
$$;
create function public.registration_enabled() returns boolean language sql stable security invoker set search_path='' as $$ select private.registration_enabled(); $$;
revoke all on function private.registration_enabled() from public,anon,authenticated;
grant usage on schema private to anon;
grant execute on function private.registration_enabled() to anon,authenticated;

-- Enforce signup configuration even through the direct Auth API. Supabase's
-- invitation transaction inserts a user then sets invited_at when sending the
-- invite, so inspect the final stored row at commit rather than NEW on insert.
-- Only Auth can set this column; editable user metadata is never considered.
create function private.enforce_registration_setting() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_schedule();
 if not private.registration_enabled() and exists(select 1 from auth.users where id=new.id and invited_at is null)
 then raise exception 'Customer registration is disabled' using errcode='42501'; end if;
 return null;
end; $$;
revoke all on function private.enforce_registration_setting() from public,anon,authenticated;
create constraint trigger enforce_registration_setting after insert on auth.users
deferrable initially deferred for each row execute function private.enforce_registration_setting();

-- Reads remain SECURITY INVOKER: live admin + MFA and existing table RLS both apply.
-- Aggregation happens in PostgreSQL, not over a truncated Data API response.
create function public.admin_data(p_section text,p_id uuid default null,p_date date default null,p_status text default '',p_query text default '',p_page integer default 1)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare b public.business_settings; day_start timestamptz; day_end timestamptz; result jsonb; rows_json jsonb; n bigint; d date;
begin
 if not private.is_admin() then raise exception 'Admin with MFA required' using errcode='42501'; end if;
 if p_page is null or p_page not between 1 and 10000 or length(p_query)>100 then raise exception 'Invalid filters'; end if;
 select * into b from public.business_settings;
 d:=coalesce(p_date,(now() at time zone coalesce(b.timezone,'UTC'))::date);
 day_start:=d::timestamp at time zone coalesce(b.timezone,'UTC');
 day_end:=(d+1)::timestamp at time zone coalesce(b.timezone,'UTC');
 result:=jsonb_build_object('business',to_jsonb(b),'date',d,'page',p_page);
 if p_section='settings' then
 return result || jsonb_build_object('policy',(select to_jsonb(x) from (select * from public.booking_policy_versions where published order by version desc limit 1)x),
 'hours',(select coalesce(jsonb_agg(x order by weekday,opens_at),'[]') from public.business_hours x),
 'expected_updated_at',coalesce(b.updated_at::text,''));
 elsif p_section in ('dashboard','reports') then
 result:=result || jsonb_build_object('stats',(select jsonb_build_object(
 'today',count(*) filter(where starts_at>=day_start and starts_at<day_end),
 'pending',count(*) filter(where state='PENDING'),
 'confirmed',count(*) filter(where starts_at>=day_start and starts_at<day_end and state='CONFIRMED'),
 'completed',count(*) filter(where starts_at>=day_start and starts_at<day_end and state='COMPLETED'),
 'no_show',count(*) filter(where starts_at>=day_start and starts_at<day_end and state='NO_SHOW'),
 'upcoming',count(*) filter(where starts_at>=now() and state in ('CONFIRMED','AWAITING_PAYMENT','CHECKED_IN','IN_PROGRESS')))
 from public.appointments),
 'by_status',(select jsonb_agg(x) from (select state,(select count(*) from public.appointments a where a.state=s.state) as count from unnest(enum_range(null::public.appointment_state)) s(state))x),
 'money',(select coalesce(jsonb_agg(x),'[]') from (
 select currencies.currency,
 coalesce((select sum(amount)::text from public.payments where currency=currencies.currency and state='SUCCEEDED'),'0') as collected,
 coalesce((select sum(amount)::text from public.payments where currency=currencies.currency and state='SUCCEEDED' and paid_at>=day_start and paid_at<day_end),'0') as today_collected,
 coalesce((select sum(r.amount)::text from public.refunds r join public.payments p on p.id=r.payment_id where p.currency=currencies.currency and r.state='SUCCEEDED'),'0') as refunded,
 coalesce((select sum(greatest(0,a.total_amount-coalesce((select sum(p.amount) from public.payments p where p.appointment_id=a.id and p.state='SUCCEEDED'),0)))::text
 from public.appointments a where a.currency=currencies.currency and a.state in ('AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW')),'0') as outstanding
 from (select currency from public.appointments union select currency from public.payments union select b.currency where b.currency is not null) currencies)x));
 if p_section='reports' then return result; end if;
 result:=result || jsonb_build_object('activity',(select coalesce(jsonb_agg(x),'[]') from
 (select id,action,entity_table,created_at from public.audit_logs order by created_at desc,id limit 12)x));
 end if;
 if p_section in ('dashboard','appointments','calendar','appointment','customer') then
 if p_status<>'' and not p_status=any(enum_range(null::public.appointment_state)::text[]) then raise exception 'Invalid status'; end if;
 with matched as (
 select a.*,c.display_name customer_name,s.display_name staff_name,i.service_name_snapshot service_name,
 coalesce((select sum(amount) from public.payments where appointment_id=a.id and state='SUCCEEDED'),0)::text collected_amount
 from public.appointments a join public.customers c on c.id=a.customer_id join public.staff s on s.id=a.staff_id
 left join public.appointment_items i on i.appointment_id=a.id
 where (p_section<>'appointment' or a.id=p_id) and (p_section<>'customer' or a.customer_id=p_id)
 and (p_status='' or a.state::text=p_status)
 and (p_query='' or position(lower(p_query) in lower(c.display_name || ' ' || coalesce(i.service_name_snapshot,'') || ' ' || s.display_name || ' ' || a.id::text))>0)
 and (p_section<>'calendar' and p_date is null or a.starts_at>=day_start and a.starts_at<day_end)
 ), paged as (select * from matched order by case when p_section='calendar' then starts_at end asc, case when p_section<>'calendar' then starts_at end desc,id limit 25 offset (p_page-1)*25)
 select coalesce(jsonb_agg(paged),'[]'),(select count(*) from matched) into rows_json,n from paged;
 result:=result || jsonb_build_object('appointments',rows_json,'total',n);
 if p_section='dashboard' then
 -- Each section is separately bounded; summaries above always count the full dataset.
 result:=result || jsonb_build_object('schedule',public.admin_data('calendar',null,d)->'appointments',
 'pending',public.admin_data('appointments',null,null,'PENDING')->'appointments',
 'upcoming',(select coalesce(jsonb_agg(x),'[]') from (select a.id,a.starts_at,a.ends_at,a.state,c.display_name customer_name,s.display_name staff_name
 from public.appointments a join public.customers c on c.id=a.customer_id join public.staff s on s.id=a.staff_id
 where a.starts_at>=now() and a.state in ('AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS') order by a.starts_at,a.id limit 10)x));
 elsif p_section='appointment' then
 result:=result || jsonb_build_object('events',(select coalesce(jsonb_agg(x),'[]') from (select id,from_state,to_state,reason,created_at from public.appointment_events where appointment_id=p_id order by created_at,id)x),
 'payments',(select coalesce(jsonb_agg(x),'[]') from (select p.id,p.state,p.amount,p.currency,p.provider,p.paid_at,p.created_at,p.exception_reason,
 (select coalesce(jsonb_agg(jsonb_build_object('state',r.state,'amount',r.amount)),'[]') from public.refunds r where r.payment_id=p.id) refunds
 from public.payments p where p.appointment_id=p_id order by p.created_at desc limit 100)x));
 elsif p_section='customer' then
 result:=result || jsonb_build_object('customer',(select jsonb_build_object('id',id,'display_name',display_name,'email',email,'phone',phone,'created_at',created_at) from public.customers where id=p_id),
 'no_shows',(select count(*) from public.appointments where customer_id=p_id and state='NO_SHOW'),
 'next_appointment',(select min(starts_at) from public.appointments where customer_id=p_id and starts_at>=now() and state in ('CONFIRMED','AWAITING_PAYMENT')),
 'upcoming',(select coalesce(jsonb_agg(x),'[]') from (select a.id,a.starts_at,a.ends_at,a.state,c.display_name customer_name,s.display_name staff_name,i.service_name_snapshot service_name
 from public.appointments a join public.customers c on c.id=a.customer_id join public.staff s on s.id=a.staff_id left join public.appointment_items i on i.appointment_id=a.id
 where a.customer_id=p_id and a.starts_at>=now() and a.state in ('CONFIRMED','AWAITING_PAYMENT','CHECKED_IN','IN_PROGRESS') order by a.starts_at,a.id limit 10)x));
 end if;
 elsif p_section='customers' then
 with matched as (select id,display_name,email,phone from public.customers where p_query='' or position(lower(p_query) in lower(display_name||' '||coalesce(email,'')||' '||coalesce(phone,'')))>0),
 paged as (select c.*,(select count(*) from public.appointments where customer_id=c.id) appointment_count,
 (select max(starts_at) from public.appointments where customer_id=c.id and starts_at<now()) last_appointment,
 (select min(starts_at) from public.appointments where customer_id=c.id and starts_at>=now() and state in ('CONFIRMED','AWAITING_PAYMENT')) next_appointment
 from matched c order by display_name,id limit 25 offset (p_page-1)*25)
 select coalesce(jsonb_agg(paged),'[]'),(select count(*) from matched) into rows_json,n from paged;
 result:=result || jsonb_build_object('customers',rows_json,'total',n);
 elsif p_section='payments' then
 result:=result || jsonb_build_object('payments',(select coalesce(jsonb_agg(x),'[]') from
 (select p.id,p.appointment_id,p.amount,p.currency,p.state,p.provider,p.paid_at,p.created_at,p.exception_reason,c.display_name customer_name,a.payment_mode_snapshot,
 (select coalesce(jsonb_agg(jsonb_build_object('state',r.state,'amount',r.amount)),'[]') from public.refunds r where r.payment_id=p.id) refunds
 from public.payments p join public.appointments a on a.id=p.appointment_id join public.customers c on c.id=a.customer_id order by p.created_at desc,p.id limit 25 offset (p_page-1)*25)x),
 'total',(select count(*) from public.payments));
 elsif p_section='closures' then
 result:=result || jsonb_build_object('closures',(select coalesce(jsonb_agg(x),'[]') from (select * from public.business_closures order by starts_at desc,id limit 25 offset (p_page-1)*25)x),'total',(select count(*) from public.business_closures));
 elsif p_section='announcements' then
 result:=result || jsonb_build_object('announcements',(select coalesce(jsonb_agg(x),'[]') from (select * from public.announcements order by created_at desc,id limit 25 offset (p_page-1)*25)x),'total',(select count(*) from public.announcements));
 elsif p_section not in ('dashboard','reports','appointments','calendar','appointment','customer') then raise exception 'Unknown admin section';
 end if;
 return result;
end; $$;

revoke all on function public.admin_save_settings(jsonb),public.admin_save_hours(jsonb),public.admin_local_instant(timestamp),
public.admin_save_closure(date,boolean,time,time,text),public.admin_save_announcement(uuid,text,text,boolean,timestamp,timestamp),
public.admin_data(text,uuid,date,text,text,integer),public.registration_enabled() from public,anon,authenticated;
grant execute on function public.admin_save_settings(jsonb),public.admin_save_hours(jsonb),public.admin_local_instant(timestamp),
public.admin_save_closure(date,boolean,time,time,text),public.admin_save_announcement(uuid,text,text,boolean,timestamp,timestamp),
public.admin_data(text,uuid,date,text,text,integer) to authenticated;
grant execute on function public.registration_enabled() to anon,authenticated;
create index if not exists appointments_starts_admin_idx on public.appointments(starts_at,id);
create index if not exists audit_logs_recent_idx on public.audit_logs(created_at desc,id);
