-- Payment clocks start only after acquisition. Expiration is an authoritative
-- transition and cannot run against a pending request or a settled payment.
alter table public.appointments add constraint appointments_pending_no_payment_clock
  check (state <> 'PENDING' or (
    accepted_at is null and accepted_by is null and payment_due_at is null and payment_expired_at is null
  ));
alter table public.appointments add constraint appointments_payment_clock_requires_acceptance
  check (payment_due_at is null or accepted_at is not null);
alter table public.appointments add constraint appointments_expiration_evidence
  check (state <> 'PAYMENT_EXPIRED' or (
    accepted_at is not null and payment_due_at is not null and payment_expired_at is not null
    and payment_expired_at >= payment_due_at
  ));

create function private.guard_payment_expiration() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.payment_expired_at is not null and new.payment_expired_at is distinct from old.payment_expired_at then
    raise exception 'Payment expiration evidence is immutable';
  end if;
  if new.state = 'PAYMENT_EXPIRED' and old.state is distinct from new.state then
    if old.state <> 'AWAITING_PAYMENT' or old.accepted_at is null or old.payment_due_at is null
       or old.payment_due_at > clock_timestamp() or new.payment_expired_at is null
       or new.payment_expired_at < old.payment_due_at then
      raise exception 'Payment expiration requires an overdue accepted reservation';
    end if;
    if exists(select 1 from public.payments p where p.appointment_id = new.id
      and p.state = 'SUCCEEDED' and p.exception_reason is null) then
      raise exception 'A settled payment prevents reservation expiration';
    end if;
  end if;
  return new;
end; $$;
create trigger guard_payment_expiration before update on public.appointments
for each row execute function private.guard_payment_expiration();

create or replace function private.expire_due_payments() returns integer
language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  perform private.lock_schedule();
  update public.appointments a
     set state = 'PAYMENT_EXPIRED', payment_expired_at = clock_timestamp()
   where a.state = 'AWAITING_PAYMENT'
     and a.accepted_at is not null
     and a.payment_due_at is not null
     and a.payment_expired_at is null
     and a.payment_due_at <= clock_timestamp()
     and not exists (select 1 from public.payments p
       where p.appointment_id = a.id and p.state = 'SUCCEEDED' and p.exception_reason is null);
  get diagnostics affected = row_count;
  return affected;
end; $$;

-- Operation-scoped claims cannot drain unrelated historical jobs. The existing
-- global claim remains available to the authenticated external retry route.
create function private.claim_notification_outbox_by_key(p_key text)
returns setof public.notification_outbox
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role', true) <> 'service_role' then
    raise exception 'Backend only' using errcode = '42501';
  end if;
  if p_key is null or length(p_key) not between 1 and 200 then
    raise exception 'Invalid notification key' using errcode = '22023';
  end if;
  return query
  with candidate as (
    select o.id from public.notification_outbox o
     where o.deduplication_key = p_key
       and ((o.state = 'PENDING' and o.available_at <= clock_timestamp())
         or (o.state = 'PROCESSING' and o.locked_until <= clock_timestamp()))
     for update skip locked limit 1
  )
  update public.notification_outbox o
     set state = 'PROCESSING', attempts = o.attempts + 1,
         last_attempt_at = clock_timestamp(), locked_until = clock_timestamp() + interval '2 minutes'
    from candidate c where o.id = c.id
  returning o.*;
end; $$;
revoke all on function private.claim_notification_outbox_by_key(text) from public,anon,authenticated,service_role;
grant execute on function private.claim_notification_outbox_by_key(text) to service_role;
create function public.claim_notification_outbox_by_key(p_key text)
returns setof public.notification_outbox
language sql security invoker set search_path = '' as $$
  select * from private.claim_notification_outbox_by_key(p_key);
$$;
revoke all on function public.claim_notification_outbox_by_key(text) from public,anon,authenticated,service_role;
grant execute on function public.claim_notification_outbox_by_key(text) to service_role;

-- A queued lifecycle email is safe only while its exact event remains the
-- appointment's authoritative current state. This also checks DB time.
create function private.notification_lifecycle_current(p_outbox_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare job public.notification_outbox; booking public.appointments;
  event_state public.appointment_state;
begin
  if current_setting('role', true) <> 'service_role' then
    raise exception 'Backend only' using errcode = '42501';
  end if;
  select * into job from public.notification_outbox
   where id = p_outbox_id and state = 'PROCESSING' and kind = 'APPOINTMENT_STATE_CHANGED';
  if not found or job.appointment_id is null then return false; end if;
  select e.to_state into event_state from public.appointment_events e
   where e.id::text = job.deduplication_key and e.appointment_id = job.appointment_id;
  if not found then return false; end if;
  select * into booking from public.appointments where id = job.appointment_id;
  if not found or booking.state <> event_state then return false; end if;
  if event_state = 'PENDING' then
    return booking.accepted_at is null and booking.payment_due_at is null
      and booking.payment_expired_at is null;
  elsif event_state = 'AWAITING_PAYMENT' then
    return booking.accepted_at is not null and booking.payment_due_at is not null
      and booking.payment_due_at > clock_timestamp() and booking.payment_expired_at is null
      and booking.required_payment_amount > 0
      and not exists(select 1 from public.payments p where p.appointment_id = booking.id
        and p.state = 'SUCCEEDED' and p.exception_reason is null);
  elsif event_state = 'PAYMENT_EXPIRED' then
    return booking.accepted_at is not null and booking.payment_due_at is not null
      and booking.payment_due_at <= clock_timestamp() and booking.payment_expired_at is not null
      and booking.payment_expired_at >= booking.payment_due_at
      and not exists(select 1 from public.payments p where p.appointment_id = booking.id
        and p.state = 'SUCCEEDED' and p.exception_reason is null);
  end if;
  return true;
end; $$;
revoke all on function private.notification_lifecycle_current(uuid) from public,anon,authenticated,service_role;
grant execute on function private.notification_lifecycle_current(uuid) to service_role;
create function public.notification_lifecycle_current(p_outbox_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select private.notification_lifecycle_current(p_outbox_id);
$$;
revoke all on function public.notification_lifecycle_current(uuid) from public,anon,authenticated,service_role;
grant execute on function public.notification_lifecycle_current(uuid) to service_role;

-- OWNER sees lifecycle context and delivery metadata, never recipients or body.
create function private.owner_notification_outbox_context(p_limit integer default 100)
returns table(
  id uuid,kind text,state public.job_state,attempts integer,created_at timestamptz,
  last_attempt_at timestamptz,available_at timestamptz,locked_until timestamptz,
  last_error text,delivered_at timestamptz,public_reference text,
  appointment_state public.appointment_state,event_state public.appointment_state,
  provider_receipts jsonb
)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_owner() then
    raise exception 'Owner with MFA required' using errcode = '42501';
  end if;
  return query
  select o.id,o.kind,o.state,o.attempts,o.created_at,o.last_attempt_at,o.available_at,
         o.locked_until,o.last_error,o.delivered_at,a.public_reference,a.state,e.to_state,
         coalesce((select jsonb_agg(jsonb_build_object(
           'role',r.recipient_role,'message_id',r.provider_message_id,'accepted_at',r.accepted_at
         ) order by r.accepted_at) from public.notification_delivery_receipts r
           where r.outbox_id=o.id),'[]'::jsonb)
    from public.notification_outbox o
    left join public.appointments a on a.id=o.appointment_id
    left join public.appointment_events e on o.kind='APPOINTMENT_STATE_CHANGED'
      and e.appointment_id=o.appointment_id and e.id::text=o.deduplication_key
   order by o.created_at desc,o.id desc
   limit least(greatest(coalesce(p_limit,100),1),200);
end; $$;
revoke all on function private.owner_notification_outbox_context(integer) from public,anon,authenticated,service_role;
grant execute on function private.owner_notification_outbox_context(integer) to authenticated;
create function public.owner_notification_outbox_context(p_limit integer default 100)
returns table(
  id uuid,kind text,state public.job_state,attempts integer,created_at timestamptz,
  last_attempt_at timestamptz,available_at timestamptz,locked_until timestamptz,
  last_error text,delivered_at timestamptz,public_reference text,
  appointment_state public.appointment_state,event_state public.appointment_state,
  provider_receipts jsonb
)
language sql security invoker set search_path = '' as $$
  select * from private.owner_notification_outbox_context(p_limit);
$$;
revoke all on function public.owner_notification_outbox_context(integer) from public,anon,authenticated,service_role;
grant execute on function public.owner_notification_outbox_context(integer) to authenticated;

-- Keep the existing lease/retry state machine and add a terminal superseded category.
create or replace function private.finish_notification_outbox(
  p_id uuid,
  p_success boolean,
  p_retryable boolean default false,
  p_error_code text default null
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare job public.notification_outbox; delay_seconds integer;
begin
  if current_setting('role', true) <> 'service_role' then
    raise exception 'Backend only' using errcode = '42501';
  end if;
  if p_id is null or p_success is null then
    raise exception 'Invalid outbox acknowledgment' using errcode = '22023';
  end if;
  if p_error_code is not null and p_error_code not in ('not_configured','invalid_input','provider_error','network_error','no_recipient','unsupported_event','superseded') then
    raise exception 'Invalid outbox error category' using errcode = '22023';
  end if;

  select * into job from public.notification_outbox where id = p_id for update;
  if not found or job.state <> 'PROCESSING' then return false; end if;

  if p_success then
    update public.notification_outbox
       set state = 'DELIVERED', delivered_at = clock_timestamp(), locked_until = null,
           last_error = null
     where id = p_id;
    return true;
  end if;

  if coalesce(p_retryable, false) and job.attempts < 8 then
    delay_seconds := least(21600, 30 * (2 ^ least(job.attempts - 1, 9))::integer);
    update public.notification_outbox
       set state = 'PENDING', available_at = clock_timestamp() + make_interval(secs => delay_seconds),
           locked_until = null, last_error = coalesce(p_error_code, 'provider_error')
     where id = p_id;
  else
    update public.notification_outbox
       set state = 'FAILED', locked_until = null,
           last_error = coalesce(p_error_code, 'provider_error')
     where id = p_id;
  end if;
  return true;
end;
$$;

-- Today counts active reservations; expired records remain available by status.
create or replace function public.admin_data(p_section text,p_id uuid default null,p_date date default null,p_status text default '',p_query text default '',p_page integer default 1)
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
 'today',count(*) filter(where starts_at>=day_start and starts_at<day_end and state in ('ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS')),
 'pending',count(*) filter(where state='PENDING'),
 'payment_expired',count(*) filter(where payment_expired_at>=day_start and payment_expired_at<day_end and state='PAYMENT_EXPIRED'),
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
