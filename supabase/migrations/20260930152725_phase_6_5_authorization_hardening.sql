-- Phase 6.5: retain ordinary ADMIN management while restricting account links
-- and privileged role writes to narrow OWNER-authorized operations.

-- Column grants make the staff identity linkage immutable to ordinary clients.
revoke insert, update on public.staff from authenticated;
grant insert (display_name, slug, bio, active, published, bookable)
  on public.staff to authenticated;
grant update (display_name, slug, bio, photo_path, active, published, bookable)
  on public.staff to authenticated;

create table private.admin_invitations (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null check (length(email) between 3 and 254),
  invited_by uuid not null references auth.users(id) on delete restrict,
  invited_at timestamptz not null default now()
);
alter table private.admin_invitations enable row level security;
revoke all on private.admin_invitations from public, anon, authenticated;
grant all on private.admin_invitations to service_role;

create function private.has_usable_owner(p_excluding_user uuid default null)
returns boolean language sql volatile security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles r
    join auth.users u on u.id = r.auth_user_id
    join public.profiles p on p.auth_user_id = r.auth_user_id
    where r.role = 'OWNER'
      and (p_excluding_user is null or r.auth_user_id <> p_excluding_user)
      and u.email_confirmed_at is not null
      and p.disabled_at is null
  );
$$;
revoke all on function private.has_usable_owner(uuid) from public, anon, authenticated, service_role;

-- Ownership remains usable through role removal, profile disabling, or Auth
-- account deletion. A controlled transfer can add a ready owner before removal.
create or replace function private.protect_last_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_schedule();
  if old.role = 'OWNER' and not private.has_usable_owner(old.auth_user_id) then
    raise exception 'Cannot remove the last usable owner' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;
drop trigger protect_last_owner on public.user_roles;
create trigger protect_last_owner before delete on public.user_roles
for each row when (old.role = 'OWNER')
execute function private.protect_last_owner();
create trigger protect_owner_role_demotion before update of role on public.user_roles
for each row when (old.role = 'OWNER' and new.role is distinct from old.role)
execute function private.protect_last_owner();

create function private.protect_owner_profile_disable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_schedule();
  if old.disabled_at is null and new.disabled_at is not null
     and exists(select 1 from public.user_roles where auth_user_id = old.auth_user_id and role = 'OWNER')
     and not private.has_usable_owner(old.auth_user_id) then
    raise exception 'Cannot disable the last usable owner' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_owner_profile_disable() from public, anon, authenticated;
create trigger protect_owner_profile_disable before update of disabled_at on public.profiles
for each row execute function private.protect_owner_profile_disable();

create function private.protect_owner_auth_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_schedule();
  if exists(select 1 from public.user_roles where auth_user_id = old.id and role = 'OWNER')
     and not private.has_usable_owner(old.id) then
    raise exception 'Cannot delete the last usable owner account' using errcode = '23514';
  end if;
  return old;
end;
$$;
revoke all on function private.protect_owner_auth_delete() from public, anon, authenticated;
create trigger protect_owner_auth_delete before delete on auth.users
for each row execute function private.protect_owner_auth_delete();

-- No authenticated user writes user_roles directly. Initial bootstrap remains
-- service-role-only; runtime role changes use the OWNER-checked routines below.
revoke insert, update, delete on public.user_roles from authenticated;
drop policy owner_role_insert on public.user_roles;
drop policy owner_role_delete on public.user_roles;

create function private.manage_owner_admins(p_action text, p_user uuid default null, p_email text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target_email text; invitation private.admin_invitations; result jsonb;
begin
  if auth.uid() is null or not private.is_owner() then
    raise exception 'Owner with MFA required' using errcode = '42501';
  end if;
  perform private.lock_schedule();

  if p_action = 'list' then
    select coalesce(jsonb_agg(x order by x->>'email'), '[]'::jsonb) into result
    from (
      select jsonb_build_object(
        'user_id', u.id, 'email', u.email, 'email_confirmed', u.email_confirmed_at is not null,
        'active', p.disabled_at is null, 'role', 'ADMIN', 'status',
        case when p.disabled_at is not null then 'disabled'
             when u.email_confirmed_at is null then 'invited/unverified' else 'active' end
      ) x from public.user_roles r
      join auth.users u on u.id = r.auth_user_id
      join public.profiles p on p.auth_user_id = r.auth_user_id
      where r.role = 'ADMIN'
      union all
      select jsonb_build_object(
        'user_id', u.id, 'email', u.email, 'email_confirmed', false,
        'active', p.disabled_at is null, 'role', null, 'status',
        case when p.disabled_at is not null then 'disabled'
             when u.email_confirmed_at is not null then 'verified/pending activation'
             else 'invited/pending' end
      ) x from private.admin_invitations i
      join auth.users u on u.id = i.auth_user_id
      join public.profiles p on p.auth_user_id = i.auth_user_id
      where not exists(select 1 from public.user_roles r where r.auth_user_id = i.auth_user_id and r.role = 'ADMIN')
    ) q;
    return coalesce(result, '[]'::jsonb);
  elsif p_action = 'record-invitation' then
    if p_user is null or p_email is null then raise exception 'User and email are required'; end if;
    select lower(u.email) into target_email from auth.users u
      join public.profiles p on p.auth_user_id = u.id
      where u.id = p_user and p.disabled_at is null and u.invited_at is not null
        and u.email_confirmed_at is null;
    if target_email is null or target_email <> lower(trim(p_email)) then
      raise exception 'A matching active, unaccepted Auth invitation is required';
    end if;
    if exists(select 1 from public.user_roles where auth_user_id = p_user)
       or exists(select 1 from public.staff where auth_user_id = p_user) then
      raise exception 'Choose an account without an existing privileged or staff identity';
    end if;
    insert into private.admin_invitations(auth_user_id, email, invited_by)
      values(p_user, target_email, auth.uid())
      on conflict(auth_user_id) do update set email = excluded.email, invited_by = excluded.invited_by, invited_at = now();
    insert into public.audit_logs(actor_id, action, entity_table, entity_id, details)
      values(auth.uid(), 'ADMIN_INVITED', 'user_roles', p_user, jsonb_build_object('email', target_email));
    return jsonb_build_object('status', 'invited/pending', 'user_id', p_user);
  elsif p_action = 'grant' then
    if p_user is null then raise exception 'Target user is required'; end if;
    select lower(u.email) into target_email from auth.users u
      join public.profiles p on p.auth_user_id = u.id
      where u.id = p_user and u.email is not null and u.email_confirmed_at is not null and p.disabled_at is null;
    if target_email is null then raise exception 'Target must have a confirmed email and active profile'; end if;
    if exists(select 1 from public.user_roles where auth_user_id = p_user and role in ('OWNER','STAFF'))
       or exists(select 1 from public.staff where auth_user_id = p_user) then
      raise exception 'Target has a conflicting privileged or staff identity';
    end if;
    insert into public.user_roles(auth_user_id, role) values(p_user, 'ADMIN')
      on conflict(auth_user_id, role) do nothing;
    delete from private.admin_invitations where auth_user_id = p_user;
    insert into public.audit_logs(actor_id, action, entity_table, entity_id, details)
      values(auth.uid(), 'ADMIN_GRANTED', 'user_roles', p_user, '{}'::jsonb);
    return jsonb_build_object('status', 'active', 'user_id', p_user);
  elsif p_action = 'revoke' then
    if p_user is null then raise exception 'Target user is required'; end if;
    delete from public.user_roles where auth_user_id = p_user and role = 'ADMIN';
    if not found then raise exception 'ADMIN role not found'; end if;
    delete from private.admin_invitations where auth_user_id = p_user;
    insert into public.audit_logs(actor_id, action, entity_table, entity_id, details)
      values(auth.uid(), 'ADMIN_REVOKED', 'user_roles', p_user, '{}'::jsonb);
    return jsonb_build_object('status', 'revoked', 'user_id', p_user);
  else
    raise exception 'Unknown owner access action';
  end if;
end;
$$;
revoke all on function private.manage_owner_admins(text, uuid, text) from public, anon, authenticated, service_role;

create function public.manage_owner_admins(p_action text, p_user uuid default null, p_email text default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.manage_owner_admins(p_action, p_user, p_email);
$$;
revoke all on function public.manage_owner_admins(text, uuid, text) from public, anon, authenticated, service_role;
grant execute on function private.manage_owner_admins(text, uuid, text) to authenticated;
grant execute on function public.manage_owner_admins(text, uuid, text) to authenticated;

create function private.audit_staff_identity_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.auth_user_id is not null then
    insert into public.audit_logs(actor_id, action, entity_table, entity_id, details)
      values(auth.uid(), 'STAFF_ACCOUNT_LINKED', 'staff', new.id,
        jsonb_build_object('auth_user_id', new.auth_user_id));
  elsif tg_op = 'UPDATE' and old.auth_user_id is distinct from new.auth_user_id then
    insert into public.audit_logs(actor_id, action, entity_table, entity_id, details)
      values(auth.uid(), case when new.auth_user_id is null then 'STAFF_ACCOUNT_UNLINKED' else 'STAFF_ACCOUNT_LINKED' end,
        'staff', new.id, jsonb_build_object('auth_user_id', new.auth_user_id));
  end if;
  return new;
end;
$$;
revoke all on function private.audit_staff_identity_change() from public, anon, authenticated;
create trigger audit_staff_identity_change after insert or update on public.staff
for each row execute function private.audit_staff_identity_change();

-- Existing idempotent submissions can return the appointment ID, but cannot
-- mint a replacement bearer credential. Recovery requires a separate verified
-- flow; the original random token remains scoped, expiring and revocable.
create or replace function private.public_booking_submit(
  p_service uuid, p_staff uuid, p_start timestamptz, p_request_key uuid,
  p_name text, p_email text, p_phone text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  b public.business_settings; c public.customers; existing public.appointments;
  result uuid; chosen uuid; availability jsonb; slot jsonb; local_day date;
  normalized_email text; normalized_phone text; guest_token text; token_hash text;
begin
  if p_service is null or p_start is null or p_request_key is null then raise exception 'Invalid booking request'; end if;
  perform private.lock_schedule();
  select * into b from public.business_settings limit 1;
  if not found or not b.published then raise exception 'Online booking is unavailable'; end if;
  select * into existing from public.appointments a where a.request_key = p_request_key;
  if found then
    if auth.uid() is null then
      if p_name is null or length(trim(p_name)) not between 2 and 200
         or p_email is null or length(trim(p_email)) > 254
         or trim(p_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
        raise exception 'Valid guest contact information is required';
      end if;
      normalized_email := lower(trim(p_email));
      if (p_staff is not null and existing.staff_id <> p_staff) or existing.starts_at <> p_start
         or not exists (
           select 1 from public.appointments a
           join public.customers x on x.id = a.customer_id
           join public.appointment_items i on i.appointment_id = a.id
           where a.id = existing.id and x.auth_user_id is null
             and x.display_name = trim(p_name) and x.email = normalized_email and i.service_id = p_service
         ) then raise exception 'Idempotency key reused with different booking'; end if;
      return jsonb_build_object('appointment_id', existing.id, 'guest_token', null);
    else
      select * into c from public.customers where auth_user_id = auth.uid();
      if not found or existing.customer_id <> c.id or existing.starts_at <> p_start
         or (p_staff is not null and existing.staff_id <> p_staff)
         or not exists(select 1 from public.appointment_items i where i.appointment_id = existing.id and i.service_id = p_service) then
        raise exception 'Idempotency key reused with different booking';
      end if;
      return jsonb_build_object('appointment_id', existing.id, 'guest_token', null);
    end if;
  end if;

  local_day := (p_start at time zone b.timezone)::date;
  availability := private.calculate_availability(p_service, local_day, p_staff, false);
  select x into slot from jsonb_array_elements(coalesce(availability->'slots', '[]'::jsonb)) x
    where x->>'starts_at' = p_start::text or (x->>'starts_at')::timestamptz = p_start limit 1;
  if slot is null then raise exception 'This time is no longer available'; end if;
  chosen := coalesce(p_staff, nullif(slot->>'assigned_staff_id', '')::uuid);
  if chosen is null or not exists(select 1 from jsonb_array_elements(coalesce(slot->'staff', '[]'::jsonb)) x where x->>'id' = chosen::text) then
    raise exception 'No eligible staff member is available';
  end if;

  if auth.uid() is null then
    if not b.guest_booking_enabled then raise exception 'Guest booking is disabled'; end if;
    if p_name is null or length(trim(p_name)) not between 2 and 200
       or p_email is null or length(trim(p_email)) > 254
       or trim(p_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
       or (p_phone is not null and trim(p_phone) <> '' and trim(p_phone) !~ '^\+?[0-9 ()-]{7,25}$') then
      raise exception 'Valid guest contact information is required';
    end if;
    guest_token := translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
    token_hash := encode(extensions.digest(convert_to(guest_token, 'UTF8'), 'sha256'), 'hex');
    normalized_email := lower(trim(p_email)); normalized_phone := nullif(trim(p_phone), '');
    insert into public.customers(display_name, email, phone)
      values(trim(p_name), normalized_email, normalized_phone) returning * into c;
  else
    select * into c from public.customers where auth_user_id = auth.uid();
    if not found then raise exception 'Complete your customer profile before booking'; end if;
    select lower(u.email) into normalized_email from auth.users u
      where u.id = auth.uid() and u.email_confirmed_at is not null;
    if normalized_email is null then raise exception 'Verify your account email before booking'; end if;
    if p_name is not null and length(trim(p_name)) between 2 and 200 then c.display_name := trim(p_name); end if;
    c.email := normalized_email;
    if p_phone is not null then
      if trim(p_phone) <> '' and trim(p_phone) !~ '^\+?[0-9 ()-]{7,25}$' then raise exception 'Enter a valid mobile number'; end if;
      c.phone := nullif(trim(p_phone), '');
    end if;
    if c.email is null and c.phone is null then raise exception 'An email address or mobile number is required'; end if;
    update public.customers set display_name = c.display_name, email = c.email, phone = c.phone where id = c.id;
  end if;

  result := private.request_appointment(c.id, chosen, p_service, p_start, p_request_key);
  if auth.uid() is null then
    insert into public.guest_access_tokens(appointment_id, token_hash, scope, expires_at)
      values(result, token_hash, 'VIEW', clock_timestamp() + interval '30 days');
  end if;
  return jsonb_build_object('appointment_id', result, 'guest_token', guest_token);
end;
$$;
revoke all on function private.public_booking_submit(uuid, uuid, timestamptz, uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function private.public_booking_submit(uuid, uuid, timestamptz, uuid, text, text, text) to anon, authenticated;

-- Bind the credential lookup to the appointment UUID used by its cookie slot.
drop function public.guest_appointment_by_token(text);
drop function private.guest_appointment_by_token(text);
create function private.guest_appointment_by_token(p_token_hash text, p_appointment uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', a.id, 'reference', left(replace(a.id::text, '-', ''), 12), 'state', a.state,
    'starts_at', a.starts_at, 'ends_at', a.ends_at, 'currency', a.currency,
    'total_amount', a.total_amount, 'payment_mode', a.payment_mode_snapshot,
    'required_payment_amount', a.required_payment_amount, 'payment_due_at', a.payment_due_at,
    'customer_name', c.display_name, 'customer_email', c.email, 'customer_phone', c.phone,
    'staff_name', s.display_name, 'service_name', i.service_name_snapshot,
    'duration_minutes', i.duration_minutes, 'timezone', b.timezone
  )
  from public.guest_access_tokens t
  join public.appointments a on a.id = t.appointment_id
  join public.customers c on c.id = a.customer_id
  join public.staff s on s.id = a.staff_id
  join public.appointment_items i on i.appointment_id = a.id
  cross join public.business_settings b
  where t.token_hash = p_token_hash and a.id = p_appointment and t.scope = 'VIEW'
    and t.consumed_at is null and t.revoked_at is null and t.expires_at > clock_timestamp()
  limit 1;
$$;
revoke all on function private.guest_appointment_by_token(text, uuid) from public, anon, authenticated, service_role;
create function public.guest_appointment_by_token(p_token_hash text, p_appointment uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.guest_appointment_by_token(p_token_hash, p_appointment);
$$;
revoke all on function public.guest_appointment_by_token(text, uuid) from public, anon, authenticated, service_role;
grant execute on function private.guest_appointment_by_token(text, uuid) to anon, authenticated;
grant execute on function public.guest_appointment_by_token(text, uuid) to anon, authenticated;
