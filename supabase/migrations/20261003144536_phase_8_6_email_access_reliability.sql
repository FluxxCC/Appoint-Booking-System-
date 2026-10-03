-- Phase 8.6: safer transactional email observability and customer access.
-- This migration is additive. It does not alter appointment, payment, or role data.

alter table public.notification_outbox add column last_attempt_at timestamptz;

create table public.notification_delivery_receipts (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.notification_outbox(id) on delete cascade,
  idempotency_key text not null unique check (idempotency_key ~ '^[a-f0-9]{64}$'),
  recipient_role text not null check (recipient_role in ('customer','guest','assigned_staff','admin_ops','business_contact')),
  provider_message_id text not null check (length(provider_message_id) between 1 and 200),
  accepted_at timestamptz not null default clock_timestamp()
);
alter table public.notification_delivery_receipts enable row level security;
revoke all on public.notification_delivery_receipts from public, anon, authenticated;
revoke all on public.notification_delivery_receipts from service_role;
create index notification_delivery_receipts_outbox_idx on public.notification_delivery_receipts(outbox_id, accepted_at);

create or replace function private.claim_notification_outbox(p_limit integer default 25)
returns setof public.notification_outbox
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role', true) <> 'service_role' then
    raise exception 'Backend only' using errcode = '42501';
  end if;

  return query
  with candidates as (
    select o.id
    from public.notification_outbox o
    where (o.state = 'PENDING' and o.available_at <= clock_timestamp())
       or (o.state = 'PROCESSING' and o.locked_until <= clock_timestamp())
    order by o.available_at, o.created_at, o.id
    for update skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
  )
  update public.notification_outbox o
     set state = 'PROCESSING',
         attempts = o.attempts + 1,
         last_attempt_at = clock_timestamp(),
         locked_until = clock_timestamp() + interval '2 minutes'
    from candidates c
   where o.id = c.id
  returning o.*;
end;
$$;
revoke all on function private.claim_notification_outbox(integer) from public, anon, authenticated, service_role;
grant execute on function private.claim_notification_outbox(integer) to service_role;

create or replace function public.claim_notification_outbox(p_limit integer default 25)
returns setof public.notification_outbox
language sql security invoker set search_path = '' as $$
  select * from private.claim_notification_outbox(p_limit);
$$;
revoke all on function public.claim_notification_outbox(integer) from public, anon, authenticated, service_role;
grant execute on function public.claim_notification_outbox(integer) to service_role;

create function private.record_notification_delivery(
  p_outbox_id uuid,
  p_idempotency_key text,
  p_recipient_role text,
  p_provider_message_id text
)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role', true) <> 'service_role' then
    raise exception 'Backend only' using errcode = '42501';
  end if;
  if p_outbox_id is null or p_idempotency_key is null or p_idempotency_key !~ '^[a-f0-9]{64}$'
     or p_recipient_role is null or p_recipient_role not in ('customer','guest','assigned_staff','admin_ops','business_contact')
     or p_provider_message_id is null or length(p_provider_message_id) not between 1 and 200 then
    raise exception 'Invalid delivery receipt' using errcode = '22023';
  end if;
  insert into public.notification_delivery_receipts(outbox_id,idempotency_key,recipient_role,provider_message_id)
  values(p_outbox_id,p_idempotency_key,p_recipient_role,p_provider_message_id)
  on conflict (idempotency_key) do update
    set provider_message_id = excluded.provider_message_id,
        accepted_at = clock_timestamp()
    where notification_delivery_receipts.outbox_id = excluded.outbox_id
      and notification_delivery_receipts.recipient_role = excluded.recipient_role;
  return found;
end;
$$;
revoke all on function private.record_notification_delivery(uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.record_notification_delivery(uuid,text,text,text) to service_role;
create function public.record_notification_delivery(
  p_outbox_id uuid,p_idempotency_key text,p_recipient_role text,p_provider_message_id text
) returns boolean language sql security invoker set search_path = '' as $$
  select private.record_notification_delivery(p_outbox_id,p_idempotency_key,p_recipient_role,p_provider_message_id);
$$;
revoke all on function public.record_notification_delivery(uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.record_notification_delivery(uuid,text,text,text) to service_role;

-- Recovery jobs contain only the appointment id. The raw access credential is
-- created by the dispatcher immediately before delivery and is never queued.
create function private.enqueue_guest_access_notification(p_email text,p_reference text,p_request_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare booking uuid;
begin
  if current_setting('role', true) <> 'service_role' then
    raise exception 'Backend only' using errcode = '42501';
  end if;
  if p_request_id is null or p_email is null or p_reference is null
     or length(trim(p_email)) > 254 or p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or p_reference !~* '^BK-[A-F0-9]{16}$' then
    return false;
  end if;
  select a.id into booking
    from public.appointments a
    join public.customers c on c.id=a.customer_id
   where c.auth_user_id is null
     and lower(trim(c.email))=lower(trim(p_email))
     and a.public_reference=upper(trim(p_reference))
   limit 1;
  if booking is null then return false; end if;
  insert into public.notification_outbox(appointment_id,kind,deduplication_key,payload)
  values(booking,'GUEST_ACCESS_REQUESTED','guest-access:'||p_request_id::text,'{}'::jsonb)
  on conflict (deduplication_key) do nothing;
  return true;
end;
$$;
revoke all on function private.enqueue_guest_access_notification(text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.enqueue_guest_access_notification(text,text,uuid) to service_role;
create function public.enqueue_guest_access_notification(p_email text,p_reference text,p_request_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select private.enqueue_guest_access_notification(p_email,p_reference,p_request_id);
$$;
revoke all on function public.enqueue_guest_access_notification(text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.enqueue_guest_access_notification(text,text,uuid) to service_role;

-- Preserve the existing cryptographic, hashed, single-use exchange model but
-- give normal email delivery up to an hour to reach and be opened.
create or replace function private.issue_guest_access_link(p_email text,p_reference text default null,p_appointment uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare booking uuid; raw_token text; hashed text;
begin
 if p_reference is null and p_appointment is null then return null; end if;
 select a.id into booking from public.appointments a
 join public.customers c on c.id=a.customer_id
  where c.auth_user_id is null and lower(trim(c.email))=lower(trim(p_email))
   and (p_reference is null or a.public_reference=upper(trim(p_reference)))
   and (p_appointment is null or a.id=p_appointment)
 limit 1;
 if booking is null then return null; end if;
 raw_token := translate(rtrim(encode(extensions.gen_random_bytes(32),'base64'),'='),'+/','-_');
 hashed := encode(extensions.digest(convert_to(raw_token,'UTF8'),'sha256'),'hex');
 insert into public.guest_access_tokens(appointment_id,token_hash,scope,expires_at)
 values(booking,hashed,'MANAGE',clock_timestamp()+interval '60 minutes');
 return jsonb_build_object('appointment_id',booking,'token',raw_token);
end; $$;
revoke all on function private.issue_guest_access_link(text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.issue_guest_access_link(text,text,uuid) to service_role;

create function private.owner_notification_outbox(p_limit integer default 100)
returns table(
  id uuid,kind text,state public.job_state,attempts integer,created_at timestamptz,
  last_attempt_at timestamptz,available_at timestamptz,locked_until timestamptz,
  last_error text,delivered_at timestamptz,provider_receipts jsonb
)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_owner() then
    raise exception 'Owner with MFA required' using errcode = '42501';
  end if;
  return query
  select o.id,o.kind,o.state,o.attempts,o.created_at,o.last_attempt_at,o.available_at,
         o.locked_until,o.last_error,o.delivered_at,
         coalesce((select jsonb_agg(jsonb_build_object(
           'role',r.recipient_role,'message_id',r.provider_message_id,'accepted_at',r.accepted_at
         ) order by r.accepted_at) from public.notification_delivery_receipts r where r.outbox_id=o.id),'[]'::jsonb)
    from public.notification_outbox o
   order by o.created_at desc,o.id desc
   limit least(greatest(coalesce(p_limit,100),1),200);
end;
$$;
revoke all on function private.owner_notification_outbox(integer) from public,anon,authenticated,service_role;
grant execute on function private.owner_notification_outbox(integer) to authenticated;
create function public.owner_notification_outbox(p_limit integer default 100)
returns table(
  id uuid,kind text,state public.job_state,attempts integer,created_at timestamptz,
  last_attempt_at timestamptz,available_at timestamptz,locked_until timestamptz,
  last_error text,delivered_at timestamptz,provider_receipts jsonb
)
language sql security invoker set search_path = '' as $$
  select * from private.owner_notification_outbox(p_limit);
$$;
revoke all on function public.owner_notification_outbox(integer) from public,anon,authenticated,service_role;
grant execute on function public.owner_notification_outbox(integer) to authenticated;

comment on table public.notification_delivery_receipts is
  'Server-only provider acknowledgments; stores role and provider message ID, never recipient address, content, or token.';
