-- Lease and acknowledge the existing transactional outbox without granting
-- browser roles access to queued notification payloads.
create function private.claim_notification_outbox(p_limit integer default 25)
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
         locked_until = clock_timestamp() + interval '2 minutes'
    from candidates c
   where o.id = c.id
  returning o.*;
end;
$$;

revoke all on function private.claim_notification_outbox(integer) from public, anon, authenticated, service_role;
grant execute on function private.claim_notification_outbox(integer) to service_role;

create function public.claim_notification_outbox(p_limit integer default 25)
returns setof public.notification_outbox
language sql security invoker set search_path = '' as $$
  select * from private.claim_notification_outbox(p_limit);
$$;
revoke all on function public.claim_notification_outbox(integer) from public, anon, authenticated, service_role;
grant execute on function public.claim_notification_outbox(integer) to service_role;

create function private.finish_notification_outbox(
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
  if p_error_code is not null and p_error_code not in ('not_configured','invalid_input','provider_error','network_error','no_recipient','unsupported_event') then
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

revoke all on function private.finish_notification_outbox(uuid, boolean, boolean, text) from public, anon, authenticated, service_role;
grant execute on function private.finish_notification_outbox(uuid, boolean, boolean, text) to service_role;

create function public.finish_notification_outbox(
  p_id uuid,
  p_success boolean,
  p_retryable boolean default false,
  p_error_code text default null
)
returns boolean language sql security invoker set search_path = '' as $$
  select private.finish_notification_outbox(p_id, p_success, p_retryable, p_error_code);
$$;
revoke all on function public.finish_notification_outbox(uuid, boolean, boolean, text) from public, anon, authenticated, service_role;
grant execute on function public.finish_notification_outbox(uuid, boolean, boolean, text) to service_role;

comment on function public.claim_notification_outbox(integer) is
  'Service-role-only atomic lease for notification delivery; expired leases are recoverable.';
comment on function public.finish_notification_outbox(uuid, boolean, boolean, text) is
  'Service-role-only outbox acknowledgment with bounded exponential retry and safe error categories.';
