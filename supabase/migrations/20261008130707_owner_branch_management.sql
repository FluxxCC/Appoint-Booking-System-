-- Phase 2: OWNER-managed branch setup. Additional branches remain staged until
-- the branch-aware booking and operational workspace release (Phase 3).

create function private.audit_branch_management_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs(actor_id, action, entity_table, entity_id, branch_id, details)
  values (
    auth.uid(),
    case when tg_op = 'INSERT' then 'BRANCH_CREATED' else 'BRANCH_UPDATED' end,
    'branches',
    new.id,
    new.id,
    jsonb_build_object('operation', tg_op)
  );
  return new;
end;
$$;
revoke all on function private.audit_branch_management_change() from public, anon, authenticated, service_role;

create trigger audit_branch_management_change
after insert or update on public.branches
for each row execute function private.audit_branch_management_change();

create function public.owner_save_branch(
  p_branch uuid,
  p_expected_updated_at timestamptz,
  p_values jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  branch_row public.branches;
  business_row public.business_settings;
  branch_name text;
  branch_slug text;
  branch_address text;
  branch_email text;
  branch_phone text;
  branch_timezone text;
  branch_latitude numeric;
  branch_longitude numeric;
  branch_radius numeric;
  branch_visible boolean;
  branch_active boolean;
  branch_bookable boolean;
  approval_mode text;
begin
  if auth.uid() is null or not private.is_owner() then
    raise exception 'OWNER with MFA required to manage branches' using errcode = '42501';
  end if;
  if p_values is null or jsonb_typeof(p_values) is distinct from 'object' then
    raise exception 'Branch details are required' using errcode = '22023';
  end if;

  branch_name := nullif(btrim(p_values->>'name'), '');
  branch_slug := nullif(btrim(p_values->>'slug'), '');
  branch_address := nullif(btrim(p_values->>'address'), '');
  branch_email := nullif(btrim(p_values->>'contact_email'), '');
  branch_phone := nullif(btrim(p_values->>'contact_phone'), '');
  branch_timezone := nullif(btrim(p_values->>'timezone'), '');
  branch_latitude := nullif(p_values->>'service_origin_latitude', '')::numeric;
  branch_longitude := nullif(p_values->>'service_origin_longitude', '')::numeric;
  branch_radius := nullif(p_values->>'home_service_max_radius_km', '')::numeric;
  branch_visible := coalesce((p_values->>'public_visible')::boolean, false);
  branch_active := coalesce((p_values->>'is_active')::boolean, false);
  branch_bookable := coalesce((p_values->>'booking_enabled')::boolean, false);
  approval_mode := coalesce(nullif(p_values->>'approval_mode', ''), 'ADMIN_APPROVAL');

  if branch_name is null or length(branch_name) > 200 then
    raise exception 'Enter a branch name between 1 and 200 characters' using errcode = '22023';
  end if;
  if branch_slug is null or length(branch_slug) > 100 or branch_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Use a unique lowercase slug with hyphens between words' using errcode = '22023';
  end if;
  if branch_address is not null and length(branch_address) > 1000 then
    raise exception 'Branch address is too long' using errcode = '22023';
  end if;
  if branch_email is not null and (length(branch_email) > 254 or
     branch_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'Enter a valid branch contact email' using errcode = '22023';
  end if;
  if branch_phone is not null and (length(branch_phone) > 40 or branch_phone !~ '^[+0-9 ()-]+$') then
    raise exception 'Enter a valid branch contact phone' using errcode = '22023';
  end if;
  if branch_timezone is null or length(branch_timezone) > 100 or
     not exists(select 1 from pg_catalog.pg_timezone_names where name = branch_timezone) then
    raise exception 'Choose a valid IANA timezone' using errcode = '22023';
  end if;
  if approval_mode not in ('ADMIN_APPROVAL', 'STAFF_APPROVAL', 'AUTO_CONFIRM') then
    raise exception 'Choose a valid booking approval mode' using errcode = '22023';
  end if;

  if p_branch is null then
    if branch_active or branch_bookable then
      raise exception 'New branches start as drafts. Complete branch-aware operational setup before activation.'
        using errcode = '55000';
    end if;
    insert into public.branches(
      name, slug, is_default, is_active, public_visible, booking_enabled,
      address, contact_email, contact_phone, timezone,
      service_origin_latitude, service_origin_longitude, home_service_max_radius_km
    ) values (
      branch_name, branch_slug, false, false, branch_visible, false,
      branch_address, branch_email, branch_phone, branch_timezone,
      branch_latitude, branch_longitude, branch_radius
    ) returning * into branch_row;
    insert into public.branch_booking_settings(branch_id, approval_mode)
    values (branch_row.id, approval_mode);
    return to_jsonb(branch_row);
  end if;

  select * into branch_row from public.branches where id = p_branch for update;
  if not found then
    raise exception 'Branch not found' using errcode = 'P0002';
  end if;
  if p_expected_updated_at is null or branch_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'Branch details changed in another session. Reload and review the latest values.'
      using errcode = '40001';
  end if;

  if branch_row.is_default then
    select * into business_row from public.business_settings where singleton for share;
    if not found then
      raise exception 'Default branch settings are unavailable' using errcode = '55000';
    end if;
    if (branch_address, branch_email, branch_phone, branch_timezone,
        branch_latitude, branch_longitude, branch_radius)
       is distinct from
       (business_row.address, business_row.contact_email, business_row.contact_phone, business_row.timezone,
        business_row.service_origin_latitude, business_row.service_origin_longitude,
        business_row.home_service_max_radius_km)
       or branch_visible is distinct from business_row.published
       or branch_bookable is distinct from business_row.published
       or branch_active is distinct from branch_row.is_active
       or approval_mode is distinct from business_row.booking_approval_mode then
      raise exception 'Update the default location through Business Settings to keep the single-branch experience in sync'
        using errcode = '55000';
    end if;
  else
    if branch_active then
      raise exception 'Additional branch activation is held until Phase 3 branch-aware booking and workspace operations are released'
        using errcode = '55000';
    end if;
    if branch_bookable then
      raise exception 'Additional branch booking is held until Phase 3 branch-aware booking and availability are released'
        using errcode = '55000';
    end if;
  end if;

  update public.branches set
    name = branch_name,
    slug = branch_slug,
    address = branch_address,
    contact_email = branch_email,
    contact_phone = branch_phone,
    timezone = branch_timezone,
    public_visible = branch_visible,
    booking_enabled = branch_bookable,
    service_origin_latitude = branch_latitude,
    service_origin_longitude = branch_longitude,
    home_service_max_radius_km = branch_radius
  where id = p_branch
  returning * into branch_row;

  if not branch_row.is_default then
    insert into public.branch_booking_settings(branch_id, approval_mode)
    values (branch_row.id, approval_mode)
    on conflict (branch_id) do update set approval_mode = excluded.approval_mode;
  end if;
  return to_jsonb(branch_row);
end;
$$;

revoke all on function public.owner_save_branch(uuid, timestamptz, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.owner_save_branch(uuid, timestamptz, jsonb) to authenticated;
comment on function public.owner_save_branch(uuid, timestamptz, jsonb) is
  'OWNER/AAL2-only branch setup. Additional branches remain inactive and not bookable until Phase 3 releases branch-aware operations.';
