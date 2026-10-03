-- Phase 7.5C: additive access and booking policy metadata.
-- Staff rows remain valid without an Auth identity. Existing public access
-- and booking execution paths are intentionally unchanged in this phase.
alter table public.business_settings
  add column booking_approval_mode text not null default 'ADMIN_APPROVAL'
  constraint business_settings_booking_approval_mode_check
  check (booking_approval_mode in ('ADMIN_APPROVAL', 'STAFF_APPROVAL', 'AUTO_CONFIRM'));

comment on column public.business_settings.booking_approval_mode is
  'Approval responsibility selected for the business. Phase 8 will consume this policy; current appointment lifecycle remains unchanged.';

create function private.owner_staff_access()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or not private.is_owner() then
    raise exception 'Owner with MFA required' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'staff_id', s.id, 'display_name', s.display_name, 'active', s.active,
    'bookable', s.bookable, 'login_enabled', s.auth_user_id is not null, 'email', u.email
  ) order by s.display_name, s.id), '[]'::jsonb) into result
  from public.staff s left join auth.users u on u.id = s.auth_user_id;
  return result;
end;
$$;

revoke all on function private.owner_staff_access() from public, anon, authenticated, service_role;
grant execute on function private.owner_staff_access() to authenticated;

create function public.owner_staff_access()
returns jsonb
language sql security invoker set search_path = '' as $$
  select * from private.owner_staff_access();
$$;
revoke all on function public.owner_staff_access() from public, anon, authenticated, service_role;
grant execute on function public.owner_staff_access() to authenticated;

create function private.enable_staff_login(p_staff uuid, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare staff_row public.staff; target_user uuid; matches integer;
begin
  if auth.uid() is null or not private.is_owner() then
    raise exception 'Owner with MFA required' using errcode = '42501';
  end if;
  if p_staff is null or p_email is null or length(trim(p_email)) not between 3 and 254
     or trim(p_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A staff profile and valid email are required' using errcode = '22023';
  end if;

  perform private.lock_schedule();
  select * into staff_row from public.staff where id = p_staff for update;
  if not found or not staff_row.active then
    raise exception 'Choose an active staff profile' using errcode = '22023';
  end if;

  select u.id into target_user
    from auth.users u join public.profiles p on p.auth_user_id = u.id
    where lower(u.email) = lower(trim(p_email)) and p.disabled_at is null
    order by u.id limit 2;
  get diagnostics matches = row_count;
  if matches <> 1 then
    raise exception 'An active account with this email must exist before login can be enabled' using errcode = '22023';
  end if;
  if exists(select 1 from public.user_roles where auth_user_id = target_user and role in ('OWNER','ADMIN')) then
    raise exception 'Owner or administrator accounts cannot be linked as staff' using errcode = '42501';
  end if;
  if exists(select 1 from public.staff where auth_user_id = target_user and id <> p_staff) then
    raise exception 'This account is already linked to another staff profile' using errcode = '23505';
  end if;
  if staff_row.auth_user_id is not null and staff_row.auth_user_id <> target_user then
    raise exception 'This staff profile already has login access' using errcode = '23505';
  end if;

  update public.staff set auth_user_id = target_user where id = p_staff;
  insert into public.user_roles(auth_user_id, role) values (target_user, 'STAFF')
    on conflict (auth_user_id, role) do nothing;
end;
$$;

revoke all on function private.enable_staff_login(uuid, text) from public, anon, authenticated, service_role;
grant execute on function private.enable_staff_login(uuid, text) to authenticated;

create function public.enable_staff_login(p_staff uuid, p_email text)
returns void language sql security invoker set search_path = '' as $$
  select private.enable_staff_login(p_staff, p_email);
$$;
revoke all on function public.enable_staff_login(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.enable_staff_login(uuid, text) to authenticated;

create function private.disable_staff_login(p_staff uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target_user uuid;
begin
  if auth.uid() is null or not private.is_owner() then
    raise exception 'Owner with MFA required' using errcode = '42501';
  end if;
  if p_staff is null then raise exception 'A staff profile is required' using errcode = '22023'; end if;
  perform private.lock_schedule();
  select auth_user_id into target_user from public.staff where id = p_staff for update;
  if not found then raise exception 'Staff profile not found' using errcode = 'P0002'; end if;
  if target_user is null then return; end if;

  delete from public.user_roles where auth_user_id = target_user and role = 'STAFF';
  update public.staff set auth_user_id = null where id = p_staff;
end;
$$;

revoke all on function private.disable_staff_login(uuid) from public, anon, authenticated, service_role;
grant execute on function private.disable_staff_login(uuid) to authenticated;

create function public.disable_staff_login(p_staff uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.disable_staff_login(p_staff);
$$;
revoke all on function public.disable_staff_login(uuid) from public, anon, authenticated, service_role;
grant execute on function public.disable_staff_login(uuid) to authenticated;

create or replace function private.audit_staff_identity_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.auth_user_id is not null then
    insert into public.audit_logs(actor_id, action, entity_table, entity_id, details)
      values(auth.uid(), 'STAFF_LOGIN_ENABLED', 'staff', new.id, '{}'::jsonb);
  elsif tg_op = 'UPDATE' and old.auth_user_id is distinct from new.auth_user_id then
    insert into public.audit_logs(actor_id, action, entity_table, entity_id, details)
      values(auth.uid(), case when new.auth_user_id is null then 'STAFF_LOGIN_DISABLED' else 'STAFF_LOGIN_ENABLED' end,
        'staff', new.id, '{}'::jsonb);
  end if;
  return new;
end;
$$;
revoke all on function private.audit_staff_identity_change() from public, anon, authenticated;

-- Owner actions for existing administrator accounts use business email in the UI.
create function private.manage_admin_access_by_email(p_action text, p_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target_user uuid; matches integer;
begin
  if auth.uid() is null or not private.is_owner() then
    raise exception 'Owner with MFA required' using errcode = '42501';
  end if;
  if p_action not in ('grant','revoke') or p_email is null
     or length(trim(p_email)) not between 3 and 254 then
    raise exception 'Choose a valid administrator email and action' using errcode = '22023';
  end if;
  select u.id into target_user from auth.users u
    join public.profiles p on p.auth_user_id = u.id
    where lower(u.email) = lower(trim(p_email))
    order by u.id limit 2;
  get diagnostics matches = row_count;
  if matches <> 1 then raise exception 'A single matching account is required' using errcode = '22023'; end if;
  return private.manage_owner_admins(p_action, target_user, null);
end;
$$;
revoke all on function private.manage_admin_access_by_email(text, text) from public, anon, authenticated, service_role;
grant execute on function private.manage_admin_access_by_email(text, text) to authenticated;

create function public.manage_admin_access_by_email(p_action text, p_email text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.manage_admin_access_by_email(p_action, p_email);
$$;
revoke all on function public.manage_admin_access_by_email(text, text) from public, anon, authenticated, service_role;
grant execute on function public.manage_admin_access_by_email(text, text) to authenticated;
