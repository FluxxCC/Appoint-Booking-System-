-- Phase 1: branch foundation for one dedicated business database.
-- This migration is additive. It preserves the default branch as the only
-- active branch until branch-aware application operations are released.

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  is_default boolean not null default false,
  is_active boolean not null default false,
  public_visible boolean not null default false,
  booking_enabled boolean not null default false,
  address text,
  contact_email text,
  contact_phone text,
  timezone text not null default 'Asia/Manila',
  service_origin_latitude numeric(9,6),
  service_origin_longitude numeric(9,6),
  home_service_max_radius_km numeric(7,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branches_default_active_check check (not is_default or is_active),
  constraint branches_booking_active_check check (not booking_enabled or is_active),
  constraint branches_origin_coordinates_check check (
    (service_origin_latitude is null and service_origin_longitude is null) or
    (service_origin_latitude between -90 and 90 and service_origin_longitude between -180 and 180)
  ),
  constraint branches_home_radius_check check (
    home_service_max_radius_km is null or home_service_max_radius_km between 0.1 and 500
  )
);
create unique index branches_one_default_idx on public.branches(is_default) where is_default;
create index branches_public_active_idx on public.branches(is_active, public_visible, booking_enabled);

create table public.branch_booking_settings (
  branch_id uuid primary key references public.branches(id) on delete restrict,
  approval_mode text not null default 'ADMIN_APPROVAL'
    check (approval_mode in ('ADMIN_APPROVAL','STAFF_APPROVAL','AUTO_CONFIRM')),
  updated_at timestamptz not null default now()
);

create table public.branch_services (
  branch_id uuid not null references public.branches(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  active boolean not null default true,
  price_override bigint check (price_override is null or price_override between 0 and 9007199254740991),
  payment_mode_override public.payment_mode,
  deposit_type_override text check (deposit_type_override is null or deposit_type_override in ('FIXED','PERCENTAGE')),
  deposit_amount_override bigint check (deposit_amount_override is null or deposit_amount_override between 0 and 9007199254740991),
  deposit_percent_bps_override integer check (deposit_percent_bps_override between 1 and 10000),
  home_service_fee_override bigint check (home_service_fee_override is null or home_service_fee_override between 0 and 9007199254740991),
  home_travel_before_minutes_override integer check (home_travel_before_minutes_override between 0 and 240),
  home_travel_after_minutes_override integer check (home_travel_after_minutes_override between 0 and 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (branch_id, service_id),
  constraint branch_services_deposit_override_check check (
    (deposit_type_override is distinct from 'FIXED' or deposit_percent_bps_override is null) and
    (deposit_type_override is distinct from 'PERCENTAGE' or deposit_percent_bps_override is not null) and
    (deposit_percent_bps_override is null or deposit_type_override = 'PERCENTAGE') and
    (deposit_type_override is distinct from 'PERCENTAGE' or deposit_amount_override is null) and
    (deposit_type_override is distinct from 'PERCENTAGE' or payment_mode_override is null or payment_mode_override = 'DEPOSIT')
  )
);
create index branch_services_service_idx on public.branch_services(service_id, branch_id) where active;

create table public.admin_branch_memberships (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  active boolean not null default true,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (auth_user_id, branch_id),
  constraint admin_branch_membership_revocation_check check (
    (active and revoked_at is null) or (not active and revoked_at is not null)
  )
);
create index admin_branch_memberships_user_active_idx
  on public.admin_branch_memberships(auth_user_id, branch_id) where active;
create index admin_branch_memberships_branch_active_idx
  on public.admin_branch_memberships(branch_id, auth_user_id) where active;

create table public.staff_branch_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  active boolean not null default true,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, branch_id),
  constraint staff_branch_assignment_revocation_check check (
    (active and revoked_at is null) or (not active and revoked_at is not null)
  )
);
create index staff_branch_assignments_staff_active_idx
  on public.staff_branch_assignments(staff_id, branch_id) where active;
create index staff_branch_assignments_branch_active_idx
  on public.staff_branch_assignments(branch_id, staff_id) where active;

-- Expand first. Existing rows are backfilled only after the one default branch
-- has been derived from business_settings.
alter table public.booking_policy_versions add column branch_id uuid;
alter table public.staff_services add column branch_id uuid;
alter table public.business_hours add column branch_id uuid;
alter table public.business_closures add column branch_id uuid;
alter table public.staff_working_hours add column branch_id uuid;
alter table public.staff_schedule_exceptions
  add column branch_id uuid,
  add column is_global boolean not null default false;
alter table public.appointments add column branch_id uuid;
alter table public.audit_logs add column branch_id uuid;

create function private.default_active_branch_id() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare branch_count integer; result uuid;
begin
  select count(*)::integer into branch_count from public.branches where is_active;
  if branch_count <> 1 then
    raise exception 'Legacy single-branch operations require exactly one active branch' using errcode = '55000';
  end if;
  select id into result from public.branches where is_active and is_default;
  if result is null then
    raise exception 'The active default branch is unavailable' using errcode = '55000';
  end if;
  return result;
end;
$$;

create function private.ensure_default_branch() returns uuid
language plpgsql security definer set search_path = '' as $$
declare settings public.business_settings; result uuid;
begin
  select * into settings from public.business_settings order by created_at, id limit 1;
  if not found then return null; end if;

  select id into result from public.branches where is_default;
  if result is null then
    if exists(select 1 from public.branches) then
      raise exception 'A branch exists without a default branch; stop for manual review' using errcode = '55000';
    end if;
    insert into public.branches(
      name, slug, is_default, is_active, public_visible, booking_enabled,
      address, contact_email, contact_phone, timezone,
      service_origin_latitude, service_origin_longitude, home_service_max_radius_km
    ) values (
      'Main Branch', 'main', true, true, settings.published, settings.published,
      settings.address, settings.contact_email, settings.contact_phone, settings.timezone,
      settings.service_origin_latitude, settings.service_origin_longitude, settings.home_service_max_radius_km
    ) returning id into result;
  end if;

  insert into public.branch_booking_settings(branch_id, approval_mode)
  values (result, settings.booking_approval_mode)
  on conflict (branch_id) do nothing;

  insert into public.branch_services(branch_id, service_id, active)
  select result, s.id, s.active from public.services s
  on conflict (branch_id, service_id) do nothing;

  insert into public.staff_branch_assignments(staff_id, branch_id, active, assigned_at, revoked_at)
  select s.id, result, s.active, s.created_at,
    case when s.active then null else s.created_at end
  from public.staff s
  on conflict (staff_id, branch_id) do nothing;

  update public.booking_policy_versions set branch_id = result where branch_id is null;
  update public.staff_services set branch_id = result where branch_id is null;
  update public.business_hours set branch_id = result where branch_id is null;
  update public.business_closures set branch_id = result where branch_id is null;
  update public.staff_working_hours set branch_id = result where branch_id is null;
  update public.staff_schedule_exceptions
    set is_global = (kind = 'UNAVAILABLE'),
        branch_id = case when kind = 'UNAVAILABLE' then null else result end
    where branch_id is null and not is_global;
  update public.appointments set branch_id = result where branch_id is null;

  return result;
end;
$$;

create function private.bootstrap_default_branch() returns trigger
language plpgsql security definer set search_path = '' as $$
declare branch_id_value uuid;
begin
  perform private.ensure_default_branch();
  -- A first-time OWNER setup is an explicit authorization event. This also
  -- covers Admins granted before the business row existed. Never infer or
  -- restore membership from a role during an unauthenticated/service call.
  if auth.uid() is not null and private.is_owner() then
    select id into branch_id_value from public.branches where is_default and is_active;
    if branch_id_value is not null then
      insert into public.admin_branch_memberships(auth_user_id, branch_id, active, granted_by, granted_at)
      select r.auth_user_id, branch_id_value, true, auth.uid(), clock_timestamp()
      from public.user_roles r where r.role = 'ADMIN'
      on conflict (auth_user_id, branch_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;
create trigger bootstrap_default_branch after insert on public.business_settings
for each row execute function private.bootstrap_default_branch();

create function private.sync_default_branch_from_business_settings() returns trigger
language plpgsql security definer set search_path = '' as $$
declare branch_id_value uuid;
begin
  select id into branch_id_value from public.branches where is_default;
  if branch_id_value is null then
    perform private.ensure_default_branch();
    select id into branch_id_value from public.branches where is_default;
  end if;
  if branch_id_value is not null then
    update public.branches set
      address = new.address,
      contact_email = new.contact_email,
      contact_phone = new.contact_phone,
      timezone = new.timezone,
      service_origin_latitude = new.service_origin_latitude,
      service_origin_longitude = new.service_origin_longitude,
      home_service_max_radius_km = new.home_service_max_radius_km,
      public_visible = new.published,
      booking_enabled = new.published,
      updated_at = clock_timestamp()
    where id = branch_id_value;
    insert into public.branch_booking_settings(branch_id, approval_mode)
    values (branch_id_value, new.booking_approval_mode)
    on conflict (branch_id) do update set approval_mode = excluded.approval_mode,
      updated_at = clock_timestamp();
  end if;
  return new;
end;
$$;
create trigger sync_default_branch_from_business_settings after update on public.business_settings
for each row execute function private.sync_default_branch_from_business_settings();

create function private.guard_branch_activation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists(select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown IANA branch timezone';
  end if;
  if new.is_default and not new.is_active then
    raise exception 'The default branch must remain active';
  end if;
  if new.booking_enabled and not new.is_active then
    raise exception 'An inactive branch cannot accept bookings';
  end if;
  if tg_op = 'UPDATE' and old.is_default and (new.is_default is distinct from old.is_default or new.is_active is distinct from old.is_active) then
    raise exception 'The default branch identity and active state are immutable in Phase 1';
  end if;
  if new.is_active and exists(
    select 1 from public.branches b where b.is_active and b.id is distinct from new.id
  ) then
    raise exception 'A second active branch is blocked until branch-aware application operations are released' using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' then new.updated_at := clock_timestamp(); end if;
  return new;
end;
$$;
create function private.reject_branch_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Branches are deactivated, never deleted';
end;
$$;
create trigger guard_branch_activation before insert or update on public.branches
for each row execute function private.guard_branch_activation();
create trigger prevent_branch_delete before delete on public.branches
for each row execute function private.reject_branch_delete();

create function private.seed_service_branch_offering() returns trigger
language plpgsql security definer set search_path = '' as $$
declare branch_id_value uuid;
begin
  select id into branch_id_value from public.branches where is_default and is_active;
  if branch_id_value is not null then
    insert into public.branch_services(branch_id, service_id, active)
    values(branch_id_value, new.id, new.active)
    on conflict (branch_id, service_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger seed_service_branch_offering after insert on public.services
for each row execute function private.seed_service_branch_offering();

create function private.seed_staff_branch_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare branch_id_value uuid;
begin
  select id into branch_id_value from public.branches where is_default and is_active;
  if branch_id_value is not null then
    insert into public.staff_branch_assignments(staff_id, branch_id, active, assigned_at, revoked_at)
    values(new.id, branch_id_value, new.active, coalesce(new.created_at, clock_timestamp()),
      case when new.active then null else coalesce(new.created_at, clock_timestamp()) end)
    on conflict (staff_id, branch_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger seed_staff_branch_assignment after insert on public.staff
for each row execute function private.seed_staff_branch_assignment();

create function private.seed_new_admin_branch_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
declare branch_id_value uuid;
begin
  if new.role <> 'ADMIN' then return new; end if;
  if auth.uid() is null or not private.is_owner() then
    raise exception 'Only an OWNER with MFA can grant ADMIN access' using errcode = '42501';
  end if;
  select id into branch_id_value from public.branches where is_default and is_active;
  if branch_id_value is not null and (select count(*) from public.branches where is_active) = 1 then
    insert into public.admin_branch_memberships(auth_user_id, branch_id, active, granted_by, granted_at)
    values(new.auth_user_id, branch_id_value, true, auth.uid(), clock_timestamp())
    on conflict (auth_user_id, branch_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger seed_new_admin_branch_membership after insert or update of role on public.user_roles
for each row execute function private.seed_new_admin_branch_membership();

create function private.guard_admin_role_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target_role public.app_role;
begin
  target_role := case when tg_op = 'DELETE' then old.role else new.role end;
  if target_role = 'ADMIN' or (tg_op <> 'INSERT' and old.role = 'ADMIN') then
    if auth.uid() is null or not private.is_owner() then
      raise exception 'OWNER with MFA required to grant or revoke ADMIN access' using errcode = '42501';
    end if;
  end if;

  if tg_op <> 'INSERT' and old.role = 'ADMIN'
     and (tg_op = 'DELETE' or new.role <> 'ADMIN') then
    update public.admin_branch_memberships
      set active = false, revoked_by = auth.uid(), revoked_at = clock_timestamp()
      where auth_user_id = old.auth_user_id and active;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger guard_admin_role_write before insert or update or delete on public.user_roles
for each row execute function private.guard_admin_role_write();

create function private.default_branch_on_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.branch_id is null then new.branch_id := private.default_active_branch_id(); end if;
  if not exists(select 1 from public.branches where id = new.branch_id) then
    raise exception 'Unknown branch';
  end if;
  return new;
end;
$$;

create function private.default_exception_branch_on_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_global then
    if new.kind <> 'UNAVAILABLE' or new.branch_id is not null then
      raise exception 'Only global staff leave may omit a branch';
    end if;
  elsif new.branch_id is null then
    new.branch_id := private.default_active_branch_id();
  end if;
  return new;
end;
$$;

create function private.prevent_branch_reassignment() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.branch_id is distinct from old.branch_id then
    raise exception 'Operational branch attribution is immutable';
  end if;
  return new;
end;
$$;

create function private.guard_branch_service_override() returns trigger
language plpgsql set search_path = '' as $$
declare s public.services; effective_price bigint; effective_mode public.payment_mode;
  effective_deposit_type text; effective_amount bigint; effective_percent integer;
  effective_deposit bigint;
begin
  select * into s from public.services where id = new.service_id;
  if not found then raise exception 'Unknown service offering'; end if;
  effective_price := coalesce(new.price_override, s.price_amount);
  effective_mode := coalesce(new.payment_mode_override, s.payment_mode);
  effective_deposit_type := coalesce(new.deposit_type_override, s.deposit_type);
  effective_amount := coalesce(new.deposit_amount_override, s.deposit_amount);
  effective_percent := coalesce(new.deposit_percent_bps_override, s.deposit_percent_bps);
  if effective_mode = 'FULL_PAYMENT' and effective_price <= 0 then
    raise exception 'Full payment requires a positive effective price';
  end if;
  if effective_mode = 'DEPOSIT' then
    if effective_deposit_type = 'PERCENTAGE' then
      if effective_percent is null or effective_percent not between 1 and 10000 then
        raise exception 'Percentage deposit must be between 1 and 100 percent';
      end if;
      effective_deposit := ceil(effective_price::numeric * effective_percent / 10000)::bigint;
    else
      effective_deposit := effective_amount;
    end if;
    if effective_deposit is null or effective_deposit <= 0 or effective_deposit > effective_price then
      raise exception 'Effective deposit must be positive and no greater than the effective service price';
    end if;
  elsif new.deposit_type_override = 'PERCENTAGE' or coalesce(new.deposit_amount_override, 0) > 0
     or coalesce(new.deposit_percent_bps_override, 0) > 0 then
    raise exception 'Deposit overrides require DEPOSIT payment mode';
  end if;
  return new;
end;
$$;
create trigger guard_branch_service_override before insert or update on public.branch_services
for each row execute function private.guard_branch_service_override();

-- The migration-only attribution backfill must preserve historical versions
-- and timestamps. Keep these protections enabled for every application write.
alter table public.booking_policy_versions disable trigger immutable_policy;
alter table public.booking_policy_versions disable trigger touch_updated_at;
alter table public.booking_policy_versions disable trigger audit_management_change;
alter table public.staff_services disable trigger touch_updated_at;
alter table public.staff_services disable trigger audit_management_change;
alter table public.business_hours disable trigger touch_updated_at;
alter table public.business_hours disable trigger audit_management_change;
alter table public.business_closures disable trigger touch_updated_at;
alter table public.business_closures disable trigger audit_management_change;
alter table public.staff_working_hours disable trigger touch_updated_at;
alter table public.staff_working_hours disable trigger audit_management_change;
alter table public.staff_schedule_exceptions disable trigger touch_updated_at;
alter table public.staff_schedule_exceptions disable trigger audit_management_change;
alter table public.appointments disable trigger touch_updated_at;
alter table public.audit_logs disable trigger touch_updated_at;
alter table public.audit_logs disable trigger immutable_audit;

-- Seed/backfill exactly one default branch where a business row exists. On an
-- empty installation, the business_settings insert trigger performs this later.
select private.ensure_default_branch();
-- These rows are a migration-time compatibility backfill. Runtime membership
-- grants are handled only by the OWNER-authorized role/membership paths below.
insert into public.admin_branch_memberships(auth_user_id, branch_id, active, granted_at)
select r.auth_user_id, b.id, true, r.created_at
from public.user_roles r cross join public.branches b
where r.role = 'ADMIN' and b.is_default and b.is_active
on conflict (auth_user_id, branch_id) do nothing;
-- Before Phase 1, this dedicated business had one branch, so historic audit
-- events inherit that branch. Future business-wide events stay unscoped.
update public.audit_logs a set branch_id = b.id
from public.branches b
where a.branch_id is null and b.is_default and b.is_active;
set constraints all immediate;

alter table public.booking_policy_versions enable trigger immutable_policy;
alter table public.booking_policy_versions enable trigger touch_updated_at;
alter table public.booking_policy_versions enable trigger audit_management_change;
alter table public.staff_services enable trigger touch_updated_at;
alter table public.staff_services enable trigger audit_management_change;
alter table public.business_hours enable trigger touch_updated_at;
alter table public.business_hours enable trigger audit_management_change;
alter table public.business_closures enable trigger touch_updated_at;
alter table public.business_closures enable trigger audit_management_change;
alter table public.staff_working_hours enable trigger touch_updated_at;
alter table public.staff_working_hours enable trigger audit_management_change;
alter table public.staff_schedule_exceptions enable trigger touch_updated_at;
alter table public.staff_schedule_exceptions enable trigger audit_management_change;
alter table public.appointments enable trigger touch_updated_at;
alter table public.audit_logs enable trigger touch_updated_at;
alter table public.audit_logs enable trigger immutable_audit;

do $$
declare branch_id_value uuid;
begin
  select id into branch_id_value from public.branches where is_default and is_active;
  if branch_id_value is null and (
    exists(select 1 from public.booking_policy_versions) or exists(select 1 from public.staff_services) or
    exists(select 1 from public.business_hours) or exists(select 1 from public.business_closures) or
    exists(select 1 from public.staff_working_hours) or exists(select 1 from public.staff_schedule_exceptions) or
    exists(select 1 from public.appointments)
  ) then
    raise exception 'Operational rows exist without business settings; branch backfill stopped for review';
  end if;
end;
$$;

alter table public.booking_policy_versions alter column branch_id set not null;
alter table public.staff_services alter column branch_id set not null;
alter table public.business_hours alter column branch_id set not null;
alter table public.business_closures alter column branch_id set not null;
alter table public.staff_working_hours alter column branch_id set not null;
alter table public.appointments alter column branch_id set not null;

alter table public.booking_policy_versions drop constraint booking_policy_versions_version_key;
alter table public.booking_policy_versions add constraint booking_policy_versions_branch_version_key unique (branch_id, version);
alter table public.booking_policy_versions add constraint booking_policy_versions_id_branch_key unique (id, branch_id);
alter table public.booking_policy_versions add constraint booking_policy_versions_branch_fkey
  foreign key (branch_id) references public.branches(id) on delete restrict;
alter table public.staff_services drop constraint staff_services_staff_id_service_id_key;
alter table public.staff_services add constraint staff_services_staff_branch_service_key unique (staff_id, branch_id, service_id);
alter table public.staff_services add constraint staff_services_branch_fkey
  foreign key (branch_id) references public.branches(id) on delete restrict;
alter table public.staff_services add constraint staff_services_assignment_fkey
  foreign key (staff_id, branch_id) references public.staff_branch_assignments(staff_id, branch_id) on delete restrict;
alter table public.staff_services add constraint staff_services_offering_fkey
  foreign key (branch_id, service_id) references public.branch_services(branch_id, service_id) on delete restrict;
alter table public.business_hours add constraint business_hours_branch_fkey
  foreign key (branch_id) references public.branches(id) on delete restrict;
alter table public.business_hours drop constraint business_hours_weekday_opens_at_key;
alter table public.business_hours add constraint business_hours_branch_weekday_opens_key unique (branch_id, weekday, opens_at);
alter table public.business_hours drop constraint business_hours_no_overlap;
set search_path = public, extensions;
alter table public.business_hours add constraint business_hours_no_overlap exclude using gist
  (branch_id with =, weekday with =,
   numrange(extract(epoch from opens_at), extract(epoch from closes_at), '[)') with &&);
reset search_path;
alter table public.business_closures add constraint business_closures_branch_fkey
  foreign key (branch_id) references public.branches(id) on delete restrict;
alter table public.staff_working_hours add constraint staff_working_hours_branch_fkey
  foreign key (branch_id) references public.branches(id) on delete restrict;
alter table public.staff_working_hours add constraint staff_working_hours_assignment_fkey
  foreign key (staff_id, branch_id) references public.staff_branch_assignments(staff_id, branch_id) on delete restrict;
alter table public.staff_working_hours drop constraint staff_working_hours_staff_id_weekday_starts_at_key;
alter table public.staff_working_hours add constraint staff_working_hours_branch_staff_weekday_starts_key
  unique (branch_id, staff_id, weekday, starts_at);
alter table public.staff_working_hours drop constraint staff_hours_no_overlap;
set search_path = public, extensions;
alter table public.staff_working_hours add constraint staff_hours_no_overlap exclude using gist
  (staff_id with =, branch_id with =, weekday with =,
   numrange(extract(epoch from starts_at), extract(epoch from ends_at), '[)') with &&);
reset search_path;
alter table public.staff_schedule_exceptions add constraint staff_exceptions_scope_check
  check ((is_global and branch_id is null and kind = 'UNAVAILABLE') or (not is_global and branch_id is not null));
alter table public.staff_schedule_exceptions add constraint staff_exceptions_branch_fkey
  foreign key (branch_id) references public.branches(id) on delete restrict;
alter table public.staff_schedule_exceptions add constraint staff_exceptions_assignment_fkey
  foreign key (staff_id, branch_id) references public.staff_branch_assignments(staff_id, branch_id) on delete restrict;
alter table public.appointments add constraint appointments_branch_fkey
  foreign key (branch_id) references public.branches(id) on delete restrict;
alter table public.appointments add constraint appointments_staff_branch_fkey
  foreign key (staff_id, branch_id) references public.staff_branch_assignments(staff_id, branch_id) on delete restrict;
alter table public.appointments add constraint appointments_policy_branch_fkey
  foreign key (policy_version_id, branch_id) references public.booking_policy_versions(id, branch_id) on delete restrict;
alter table public.audit_logs add constraint audit_logs_branch_fkey
  foreign key (branch_id) references public.branches(id) on delete restrict;

alter table public.appointments alter column branch_id set default null;
alter table public.booking_policy_versions alter column branch_id set default null;
alter table public.staff_services alter column branch_id set default null;
alter table public.business_hours alter column branch_id set default null;
alter table public.business_closures alter column branch_id set default null;
alter table public.staff_working_hours alter column branch_id set default null;
alter table public.staff_schedule_exceptions alter column branch_id set default null;

create function private.enforce_appointment_branch() returns trigger
language plpgsql security definer set search_path = '' as $$
declare default_id uuid;
begin
  default_id := private.default_active_branch_id();
  if tg_op = 'INSERT' and new.branch_id is null then new.branch_id := default_id; end if;
  if new.branch_id is distinct from default_id then
    raise exception 'Legacy booking operations are limited to the single default branch' using errcode = '55000';
  end if;
  if tg_op = 'INSERT' and not exists(
    select 1 from public.branches b where b.id = default_id and b.is_active
      and b.public_visible and b.booking_enabled
  ) then
    raise exception 'Online booking is unavailable' using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' and new.branch_id is distinct from old.branch_id then
    raise exception 'Appointment branch attribution is immutable';
  end if;
  if tg_op = 'INSERT' and not exists(
    select 1 from public.staff_branch_assignments a
    where a.staff_id = new.staff_id and a.branch_id = new.branch_id and a.active
  ) then raise exception 'Staff is not assigned to the selected branch'; end if;
  return new;
end;
$$;
create trigger enforce_appointment_branch before insert or update of branch_id on public.appointments
for each row execute function private.enforce_appointment_branch();

create function private.guard_staff_service_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.staff_branch_assignments a
    where a.staff_id = new.staff_id and a.branch_id = new.branch_id and a.active) then
    raise exception 'Staff is not actively assigned to this branch';
  end if;
  if not exists(select 1 from public.branch_services s
    where s.branch_id = new.branch_id and s.service_id = new.service_id and s.active) then
    raise exception 'Service is not actively offered at this branch';
  end if;
  return new;
end;
$$;
create trigger guard_staff_service_assignment before insert or update on public.staff_services
for each row execute function private.guard_staff_service_assignment();

create function private.guard_appointment_item_branch() returns trigger
language plpgsql security definer set search_path = '' as $$
declare appointment_branch uuid; appointment_staff uuid;
begin
  select branch_id, staff_id into appointment_branch, appointment_staff
  from public.appointments where id = new.appointment_id;
  if appointment_branch is null then raise exception 'Appointment unavailable'; end if;
  if not exists(select 1 from public.branch_services s
      where s.branch_id = appointment_branch and s.service_id = new.service_id and s.active)
     or not exists(select 1 from public.staff_services ss
      where ss.branch_id = appointment_branch and ss.staff_id = appointment_staff
        and ss.service_id = new.service_id and ss.active) then
    raise exception 'Service and staff must both be eligible at the appointment branch';
  end if;
  return new;
end;
$$;
create trigger guard_appointment_item_branch before insert or update on public.appointment_items
for each row execute function private.guard_appointment_item_branch();

create function private.guard_membership_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_owner() then
    raise exception 'OWNER with MFA required to manage branch assignments' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then raise exception 'Branch assignment history cannot be deleted'; end if;
  if tg_op = 'UPDATE' and (new.auth_user_id, new.branch_id, new.granted_at) is distinct from
     (old.auth_user_id, old.branch_id, old.granted_at) then
    raise exception 'Branch membership identity and grant time are immutable';
  end if;
  if new.active and not exists(select 1 from public.user_roles r
    where r.auth_user_id = new.auth_user_id and r.role = 'ADMIN') then
    raise exception 'An active ADMIN role is required for branch membership';
  end if;
  if new.active then
    new.revoked_at := null;
    new.revoked_by := null;
    if tg_op = 'INSERT' then new.granted_by := coalesce(new.granted_by, auth.uid()); end if;
  elsif tg_op = 'UPDATE' and old.active then
    new.revoked_at := coalesce(new.revoked_at, clock_timestamp());
    new.revoked_by := coalesce(new.revoked_by, auth.uid());
  end if;
  if tg_op = 'UPDATE' then new.updated_at := clock_timestamp(); end if;
  return new;
end;
$$;

create function private.guard_staff_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- A missing Auth subject is not an implicit authorization grant. It occurs
  -- for trusted service/database operations, but must fail closed for API
  -- roles. Migrations and direct DBA sessions remain trusted operators.
  if auth.uid() is null then
    if current_setting('role', true) is distinct from 'service_role'
       and not (
         coalesce(current_setting('role', true), 'none') = 'none'
         and session_user in ('postgres', 'supabase_admin')
       ) then
      raise exception 'Trusted service operation required for unauthenticated staff assignment writes'
        using errcode = '42501';
    end if;
  elsif not private.is_owner() and not (
    tg_op = 'INSERT' and private.is_admin() and new.branch_id = private.default_active_branch_id()
  ) then
    raise exception 'OWNER with MFA required to manage staff branch assignments' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then raise exception 'Branch assignment history cannot be deleted'; end if;
  if tg_op = 'UPDATE' and (new.staff_id, new.branch_id, new.assigned_at) is distinct from
     (old.staff_id, old.branch_id, old.assigned_at) then
    raise exception 'Staff assignment identity and grant time are immutable';
  end if;
  if new.active and not exists(select 1 from public.staff s where s.id = new.staff_id and s.active) then
    raise exception 'An active staff profile is required for branch assignment';
  end if;
  if tg_op = 'UPDATE' and old.active and not new.active and exists(
    select 1 from public.appointments a where a.staff_id = old.staff_id and a.branch_id = old.branch_id
      and a.ends_at > clock_timestamp()
      and a.state in ('PENDING','ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS')
  ) then
    raise exception 'Resolve future appointments before revoking this staff assignment' using errcode = '55000';
  end if;
  if new.active then
    new.revoked_at := null;
    new.revoked_by := null;
    if tg_op = 'INSERT' then new.assigned_by := coalesce(new.assigned_by, auth.uid()); end if;
  elsif tg_op = 'UPDATE' and old.active then
    new.revoked_at := coalesce(new.revoked_at, clock_timestamp());
    new.revoked_by := coalesce(new.revoked_by, auth.uid());
  end if;
  if tg_op = 'UPDATE' then new.updated_at := clock_timestamp(); end if;
  return new;
end;
$$;

-- Account linkage is immutable through all UPDATE paths, including privileged
-- service-role writes. Registration creates a row for auth.uid(); guest
-- booking creates an unlinked row. A future ownership transfer must add a
-- separately authorized and audited workflow. Preserve ON DELETE SET NULL so
-- Auth account deletion can leave the historical customer/booking as a guest.
create function private.guard_customer_auth_linkage() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.auth_user_id is distinct from old.auth_user_id then
    if new.auth_user_id is null and not exists (
      select 1 from auth.users u where u.id = old.auth_user_id
    ) then
      return new;
    end if;
    raise exception 'Customer account ownership is immutable; use an authorized audited transfer workflow'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger guard_customer_auth_linkage before update of auth_user_id on public.customers
for each row execute function private.guard_customer_auth_linkage();

create function private.guard_staff_deactivation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.active and not new.active and exists(
    select 1 from public.appointments a join public.staff_branch_assignments s
      on s.staff_id = a.staff_id and s.branch_id = a.branch_id and s.active
    where a.staff_id = old.id and a.ends_at > clock_timestamp()
      and a.state in ('PENDING','ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS')
  ) then
    raise exception 'Resolve future appointments before deactivating this staff profile' using errcode = '55000';
  end if;
  return new;
end;
$$;
create trigger guard_staff_deactivation before update of active on public.staff
for each row execute function private.guard_staff_deactivation();

create trigger default_branch_insert before insert on public.booking_policy_versions
for each row execute function private.default_branch_on_insert();
create trigger default_branch_insert before insert on public.staff_services
for each row execute function private.default_branch_on_insert();
create trigger default_branch_insert before insert on public.business_hours
for each row execute function private.default_branch_on_insert();
create trigger default_branch_insert before insert on public.business_closures
for each row execute function private.default_branch_on_insert();
create trigger default_branch_insert before insert on public.staff_working_hours
for each row execute function private.default_branch_on_insert();
create trigger default_exception_branch_insert before insert or update of branch_id, is_global, kind
on public.staff_schedule_exceptions for each row execute function private.default_exception_branch_on_insert();
create trigger default_branch_insert before insert on public.appointments
for each row execute function private.default_branch_on_insert();

create trigger immutable_branch_id before update of branch_id on public.booking_policy_versions
for each row execute function private.prevent_branch_reassignment();
create trigger immutable_branch_id before update of branch_id on public.staff_services
for each row execute function private.prevent_branch_reassignment();
create trigger immutable_branch_id before update of branch_id on public.business_hours
for each row execute function private.prevent_branch_reassignment();
create trigger immutable_branch_id before update of branch_id on public.business_closures
for each row execute function private.prevent_branch_reassignment();
create trigger immutable_branch_id before update of branch_id on public.staff_working_hours
for each row execute function private.prevent_branch_reassignment();
create trigger immutable_branch_id before update of branch_id on public.staff_schedule_exceptions
for each row execute function private.prevent_branch_reassignment();
create trigger immutable_branch_id before update of branch_id on public.appointments
for each row execute function private.prevent_branch_reassignment();

create trigger guard_membership_assignment before insert or update or delete on public.admin_branch_memberships
for each row execute function private.guard_membership_assignment();
create trigger guard_staff_assignment before insert or update or delete on public.staff_branch_assignments
for each row execute function private.guard_staff_assignment();

-- The existing catalog mutation RPCs remain compatible with the one active
-- branch, while explicitly limiting their writes to that branch's rows.
create or replace function public.catalog_assign_services(p_staff uuid, p_services jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare branch_id_value uuid;
begin
  if not private.is_admin() then raise exception 'Admin with MFA required' using errcode = '42501'; end if;
  if p_services is null or jsonb_typeof(p_services) <> 'array' or jsonb_array_length(p_services) > 1000 then
    raise exception 'Invalid assignments';
  end if;
  select id into branch_id_value from public.branches where is_default and is_active;
  if branch_id_value is null then raise exception 'Default branch unavailable'; end if;
  if not exists(select 1 from public.staff where id = p_staff) then raise exception 'Staff not found'; end if;
  perform private.lock_schedule();
  update public.staff_services set active = false
    where staff_id = p_staff and branch_id = branch_id_value;
  insert into public.staff_services(staff_id, branch_id, service_id, active)
  select p_staff, branch_id_value, value::uuid, true
    from jsonb_array_elements_text(p_services)
  on conflict (staff_id, branch_id, service_id) do update set active = true;
end;
$$;

create or replace function public.catalog_save_staff_hours(p_staff uuid, p_intervals jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare branch_id_value uuid;
begin
  if not private.is_admin() then raise exception 'Admin with MFA required' using errcode = '42501'; end if;
  if p_intervals is null or jsonb_typeof(p_intervals) <> 'array' or jsonb_array_length(p_intervals) > 28 then
    raise exception 'Invalid hours';
  end if;
  select id into branch_id_value from public.branches where is_default and is_active;
  if branch_id_value is null or not exists(select 1 from public.staff where id = p_staff) then
    raise exception 'Staff or default branch not found';
  end if;
  perform private.lock_schedule();
  delete from public.staff_working_hours where staff_id = p_staff and branch_id = branch_id_value;
  insert into public.staff_working_hours(staff_id, branch_id, weekday, starts_at, ends_at)
    select p_staff, branch_id_value, weekday, opens_at, closes_at
    from jsonb_to_recordset(p_intervals) x(weekday smallint, opens_at time, closes_at time);
end;
$$;

create or replace function public.catalog_save_exception(
  p_staff uuid, p_kind public.schedule_exception_kind,
  p_start timestamp, p_end timestamp, p_reason text
) returns void language plpgsql security invoker set search_path = '' as $$
declare branch_id_value uuid; global_leave boolean;
begin
  if not private.is_admin() then raise exception 'Admin with MFA required' using errcode = '42501'; end if;
  if p_start is null or p_end is null or p_start >= p_end or length(trim(p_reason)) not between 1 and 500 then
    raise exception 'Invalid exception';
  end if;
  select id into branch_id_value from public.branches where is_default and is_active;
  if branch_id_value is null or not exists(select 1 from public.staff where id = p_staff) then
    raise exception 'Staff or default branch not found';
  end if;
  perform private.lock_schedule();
  global_leave := p_kind = 'UNAVAILABLE' and private.is_owner();
  insert into public.staff_schedule_exceptions(staff_id, branch_id, is_global, kind, starts_at, ends_at, reason)
  values(p_staff, case when global_leave then null else branch_id_value end,
    global_leave, p_kind,
    public.admin_local_instant(p_start), public.admin_local_instant(p_end), trim(p_reason));
end;
$$;

create function private.has_single_active_default_branch() returns boolean
language sql stable security definer set search_path = '' as $$
  select count(*) = 1 and coalesce(bool_or(is_default), false)
  from public.branches where is_active;
$$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_owner() or (
    private.is_active_user()
    and coalesce(auth.jwt()->>'aal' = 'aal2', false)
    and exists(select 1 from public.user_roles r where r.auth_user_id = auth.uid() and r.role = 'ADMIN')
    and (
      (private.has_single_active_default_branch() and exists(
        select 1 from public.admin_branch_memberships m join public.branches b on b.id = m.branch_id
        where m.auth_user_id = auth.uid() and m.active and b.is_default and b.is_active
      ))
      -- During first-time setup there is no business row or branch to assign.
      -- This role+MFA-only bootstrap path can only initialize the first branch;
      -- branch-scoped helpers still return false until an assignment exists.
      or (not exists(select 1 from public.branches) and not exists(select 1 from public.business_settings))
    )
  );
$$;

create or replace function private.can_admin_access_branch(p_branch uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_branch is not null and (
    private.is_owner() or (
      private.is_active_user() and coalesce(auth.jwt()->>'aal' = 'aal2', false)
      and exists(select 1 from public.user_roles r where r.auth_user_id = auth.uid() and r.role = 'ADMIN')
      and exists(select 1 from public.admin_branch_memberships m
        where m.auth_user_id = auth.uid() and m.branch_id = p_branch and m.active)
    )
  );
$$;

create or replace function private.can_staff_access_branch(p_staff uuid, p_branch uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_staff is not null and p_branch is not null and private.is_active_user()
    and exists(select 1 from public.staff s join public.user_roles r on r.auth_user_id = s.auth_user_id
      join public.staff_branch_assignments a on a.staff_id = s.id
      where s.id = p_staff and s.auth_user_id = auth.uid() and s.active
        and r.role = 'STAFF' and a.branch_id = p_branch and a.active);
$$;

create or replace function private.can_access_branch(p_branch uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_branch is not null and (private.is_owner() or
    private.can_admin_access_branch(p_branch) or exists(
      select 1 from public.staff s where s.auth_user_id = auth.uid()
        and private.can_staff_access_branch(s.id, p_branch)
    ));
$$;

create or replace function private.can_read_appointment(p_appointment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from public.appointments a where a.id = p_appointment and
    (private.can_admin_access_branch(a.branch_id) or private.can_staff_access_branch(a.staff_id, a.branch_id)
      or private.owns_customer(a.customer_id)));
$$;

create or replace function private.can_manage_appointment(p_appointment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from public.appointments a where a.id = p_appointment and
    (private.can_admin_access_branch(a.branch_id) or private.can_staff_access_branch(a.staff_id, a.branch_id)));
$$;

create or replace function private.can_read_customer(p_customer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    private.is_owner() or private.owns_customer(p_customer) or exists(
      select 1 from public.appointments a where a.customer_id = p_customer
        and private.can_admin_access_branch(a.branch_id)
    ) or exists(
      select 1 from public.appointments a where a.customer_id = p_customer
        and private.can_staff_access_branch(a.staff_id, a.branch_id)
        and a.state in ('PENDING','ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS')
        and a.ends_at > clock_timestamp() - interval '1 day'
    )
  );
$$;

create function public.is_public_branch(p_branch uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.branches b where b.id = p_branch and b.is_active
    and b.public_visible and b.booking_enabled);
$$;
create function public.has_public_default_branch() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.branches b where b.is_default and b.is_active
    and public.is_public_branch(b.id));
$$;
create function public.is_public_service_offering(p_branch uuid, p_service uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_public_branch(p_branch) and exists(select 1 from public.branch_services bs
    where bs.branch_id = p_branch and bs.service_id = p_service and bs.active);
$$;
create function public.is_public_service(p_service uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.branch_services bs
    where bs.service_id = p_service and bs.active and public.is_public_branch(bs.branch_id));
$$;
create function public.is_public_staff(p_staff uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.staff s join public.staff_branch_assignments a on a.staff_id = s.id
    where s.id = p_staff and s.active and s.published and s.bookable and a.active
      and public.is_public_branch(a.branch_id));
$$;

-- This older projection was SECURITY DEFINER and called public_catalog(),
-- which bypassed row policies while the helper ran as its owner. Rebuild every
-- branch-bound collection with explicit branch predicates before returning it.
create or replace function private.public_website_data() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'business', case when b.published and public.is_public_branch(br.id) then
      jsonb_build_object('name', b.name, 'description', b.description, 'timezone', b.timezone,
        'currency', b.currency, 'contact_email', b.contact_email, 'contact_phone', b.contact_phone,
        'address', b.address, 'guest_booking_enabled', b.guest_booking_enabled,
        'customer_registration_enabled', b.customer_registration_enabled) else null end,
    'website', case when b.published and public.is_public_branch(br.id) then
      (select jsonb_build_object('logo_path', w.logo_path, 'hero_image_path', w.hero_image_path,
        'primary_color', w.primary_color, 'font_key', w.font_key, 'sections', w.sections)
       from public.website_settings w where w.published) else null end,
    'services', case when b.published and public.is_public_branch(br.id) then coalesce((
      select jsonb_agg(to_jsonb(x) order by x.name) from (
        select s.id, s.name, s.slug, s.description, s.image_path, s.price_amount,
          s.duration_minutes, s.category_id, s.payment_mode, s.deposit_amount
        from public.services s where s.active and s.published
          and exists(select 1 from public.branch_services bs where bs.branch_id = br.id
            and bs.service_id = s.id and bs.active)
          and (s.category_id is null or exists(select 1 from public.service_categories c
            where c.id = s.category_id and c.active and c.published))
      ) x), '[]'::jsonb) else '[]'::jsonb end,
    'categories', case when b.published and public.is_public_branch(br.id) then coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug,
        'sort_order', c.sort_order) order by c.sort_order, c.name)
      from public.service_categories c where c.active and c.published), '[]'::jsonb) else '[]'::jsonb end,
    'staff', case when b.published and public.is_public_branch(br.id) then coalesce((
      select jsonb_agg(to_jsonb(x) order by x.display_name) from (
        select s.id, s.display_name, s.slug, s.bio, s.photo_path from public.staff s
        join public.staff_branch_assignments a on a.staff_id = s.id and a.branch_id = br.id and a.active
        where s.active and s.published and s.bookable
      ) x), '[]'::jsonb) else '[]'::jsonb end,
    'assignments', case when b.published and public.is_public_branch(br.id) then coalesce((
      select jsonb_agg(jsonb_build_object('staff_id', ss.staff_id, 'service_id', ss.service_id))
      from public.staff_services ss
      join public.staff st on st.id = ss.staff_id and st.active and st.published and st.bookable
      join public.services s on s.id = ss.service_id and s.active and s.published
      where ss.branch_id = br.id and ss.active
        and exists(select 1 from public.staff_branch_assignments a where a.staff_id = ss.staff_id
          and a.branch_id = br.id and a.active)
        and exists(select 1 from public.branch_services bs where bs.branch_id = br.id
          and bs.service_id = ss.service_id and bs.active)
        and (s.category_id is null or exists(select 1 from public.service_categories c
          where c.id = s.category_id and c.active and c.published))), '[]'::jsonb) else '[]'::jsonb end,
    'hours', case when b.published and public.is_public_branch(br.id) then coalesce((
      select jsonb_agg(jsonb_build_object('weekday', h.weekday, 'opens_at', h.opens_at,
        'closes_at', h.closes_at) order by h.weekday, h.opens_at)
      from public.business_hours h where h.branch_id = br.id), '[]'::jsonb) else '[]'::jsonb end,
    'announcements', case when b.published and public.is_public_branch(br.id) then coalesce((
      select jsonb_agg(jsonb_build_object('title', a.title, 'body', a.body,
        'starts_at', a.starts_at, 'ends_at', a.ends_at) order by a.starts_at desc)
      from public.announcements a where a.published and a.starts_at <= now()
        and (a.ends_at is null or a.ends_at > now())), '[]'::jsonb) else '[]'::jsonb end,
    'policy', case when b.published and public.is_public_branch(br.id) then (
      select jsonb_build_object('terms', p.terms, 'minimum_notice_minutes', p.minimum_notice_minutes,
        'maximum_advance_days', p.maximum_advance_days,
        'cancellation_notice_minutes', p.cancellation_notice_minutes)
      from public.booking_policy_versions p where p.branch_id = br.id and p.published
      order by p.version desc limit 1) else null end
  )
  from public.business_settings b
  left join public.branches br on br.is_default and br.is_active
  limit 1;
$$;

-- The legacy availability engine used deployment-wide schedule rows. Until
-- branch-aware booking ships, calculate only from the one active default
-- branch, and return no public slots unless that branch is published/bookable.
create or replace function private.calculate_availability(
  p_service uuid, p_date date, p_staff uuid default null, p_diagnostics boolean default false
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  b public.business_settings; pol public.booking_policy_versions; s public.services;
  zone text; weekday_no integer; result jsonb; branch_id_value uuid;
begin
  if p_date is null or not isfinite(p_date) then raise exception 'Choose a valid date' using errcode = '22023'; end if;
  if p_diagnostics and not private.is_admin() then raise exception 'Admin with MFA required' using errcode = '42501'; end if;
  select * into b from public.business_settings;
  select id, timezone into branch_id_value, zone
    from public.branches where is_default and is_active;
  if b.id is null or branch_id_value is null then raise exception 'Business configuration is incomplete'; end if;
  if not p_diagnostics and not public.is_public_branch(branch_id_value) then
    return jsonb_build_object('date', p_date, 'timezone', zone, 'slots', '[]'::jsonb);
  end if;
  select * into pol from public.booking_policy_versions
    where branch_id = branch_id_value and published order by version desc limit 1;
  if pol.id is null then raise exception 'Published booking policy required'; end if;
  weekday_no := extract(dow from p_date)::integer;

  if p_diagnostics then
    if not exists(select 1 from public.services where id = p_service) then raise exception 'Service not found'; end if;
    select * into s from public.services where id = p_service;
  else
    if auth.uid() is null and not b.guest_booking_enabled then
      return jsonb_build_object('date', p_date, 'timezone', zone, 'slots', '[]'::jsonb);
    end if;
    select * into s from public.services x where x.id = p_service and x.active and x.published
      and (x.category_id is null or exists(select 1 from public.service_categories c
        where c.id = x.category_id and c.active and c.published));
    if not found then return jsonb_build_object('date', p_date, 'timezone', zone, 'slots', '[]'::jsonb); end if;
  end if;
  if not exists(select 1 from public.branch_services bs
      where bs.branch_id = branch_id_value and bs.service_id = s.id and bs.active) then
    return jsonb_build_object('date', p_date, 'timezone', zone, 'slots', '[]'::jsonb);
  end if;
  if p_date < (clock_timestamp() at time zone zone)::date
     or p_date > ((clock_timestamp() + make_interval(days => pol.maximum_advance_days)) at time zone zone)::date then
    return jsonb_build_object('date', p_date, 'service', jsonb_build_object('id', s.id, 'name', s.name,
      'duration_minutes', s.duration_minutes, 'buffer_before_minutes', s.buffer_before_minutes,
      'buffer_after_minutes', s.buffer_after_minutes), 'timezone', zone,
      'scheduling_interval_minutes', b.scheduling_interval_minutes, 'slots', '[]'::jsonb);
  end if;

  with eligible as (
    select st.id, st.display_name
    from public.staff st
    join public.staff_branch_assignments a on a.staff_id = st.id
      and a.branch_id = branch_id_value and a.active
    join public.staff_services ss on ss.staff_id = st.id and ss.service_id = s.id
      and ss.branch_id = branch_id_value and ss.active
    where st.active and st.published and st.bookable and (p_staff is null or st.id = p_staff)
  ),
  grid as (
    select (p_date + bh.opens_at + make_interval(mins => step.n * b.scheduling_interval_minutes))::timestamp local_start,
      (p_date + bh.opens_at)::timestamp business_open, (p_date + bh.closes_at)::timestamp business_close
    from public.business_hours bh cross join lateral generate_series(0, 288) step(n)
    where bh.branch_id = branch_id_value and bh.weekday = weekday_no
      and p_date + bh.opens_at + make_interval(mins => step.n * b.scheduling_interval_minutes) < p_date + bh.closes_at
  ),
  staff_load as (
    select a.staff_id, count(*) daily_load from public.appointments a
    where a.branch_id = branch_id_value
      and a.starts_at >= p_date::timestamp at time zone zone
      and a.starts_at < (p_date + 1)::timestamp at time zone zone
      and a.state in ('ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW')
      and (a.state <> 'AWAITING_PAYMENT' or a.payment_due_at > clock_timestamp())
      and upper(a.occupied_range) > clock_timestamp()
    group by a.staff_id
  ),
  instants as (
    select g.*, g.local_start at time zone zone starts_at,
      (g.local_start at time zone zone) + make_interval(mins => s.duration_minutes) ends_at,
      tstzrange((g.local_start at time zone zone) - make_interval(mins => s.buffer_before_minutes),
        (g.local_start at time zone zone) + make_interval(mins => s.duration_minutes + s.buffer_after_minutes), '[)') occupied
    from grid g where private.valid_business_local_time(g.local_start, zone)
      and private.valid_business_local_time(((g.local_start at time zone zone)
        + make_interval(mins => s.duration_minutes + s.buffer_after_minutes)) at time zone zone, zone)
  ),
  valid as (
    select e.id staff_id, e.display_name, ix.local_start, ix.starts_at, ix.ends_at, ix.occupied,
      coalesce(sl.daily_load, 0) daily_load
    from eligible e cross join instants ix left join staff_load sl on sl.staff_id = e.id
    where ix.local_start >= (clock_timestamp() + make_interval(mins => pol.minimum_notice_minutes)) at time zone zone
      and ix.starts_at >= clock_timestamp() + make_interval(mins => pol.minimum_notice_minutes)
      and ix.starts_at <= clock_timestamp() + make_interval(days => pol.maximum_advance_days)
      and exists(select 1 from public.business_hours bh where bh.branch_id = branch_id_value
        and bh.weekday = weekday_no and bh.opens_at <= (lower(ix.occupied) at time zone zone)::time
        and bh.closes_at >= (upper(ix.occupied) at time zone zone)::time
        and (upper(ix.occupied) at time zone zone)::date = p_date
        and (lower(ix.occupied) at time zone zone)::date = p_date)
      and (exists(select 1 from public.staff_working_hours wh where wh.staff_id = e.id
          and wh.branch_id = branch_id_value and wh.weekday = weekday_no
          and wh.starts_at <= (lower(ix.occupied) at time zone zone)::time
          and wh.ends_at >= (upper(ix.occupied) at time zone zone)::time
          and (lower(ix.occupied) at time zone zone)::date = p_date
          and (upper(ix.occupied) at time zone zone)::date = p_date)
        or exists(select 1 from public.staff_schedule_exceptions ex where ex.staff_id = e.id
          and ex.branch_id = branch_id_value and not ex.is_global and ex.kind = 'EXTRA_HOURS'
          and tstzrange(ex.starts_at, ex.ends_at, '[)') @> ix.occupied))
      and not exists(select 1 from public.business_closures c where c.branch_id = branch_id_value
        and tstzrange(c.starts_at, c.ends_at, '[)') && ix.occupied)
      and not exists(select 1 from public.staff_schedule_exceptions ex where ex.staff_id = e.id
        and (ex.branch_id = branch_id_value or ex.is_global) and ex.kind = 'UNAVAILABLE'
        and tstzrange(ex.starts_at, ex.ends_at, '[)') && ix.occupied)
      -- Staff cannot be double-booked across branches; this exclusion remains
      -- global as a final database constraint as well.
      and not exists(select 1 from public.appointments a where a.staff_id = e.id
        and a.occupied_range && ix.occupied
        and a.state in ('ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW')
        and (a.state <> 'AWAITING_PAYMENT' or a.payment_due_at > clock_timestamp()))
  ),
  slots as (
    select v.starts_at, v.ends_at, v.local_start,
      jsonb_agg(v.staff_id order by v.staff_id) staff_ids,
      (array_agg(v.staff_id order by v.daily_load, v.staff_id))[1] assigned_staff_id,
      jsonb_agg(jsonb_build_object('id', v.staff_id, 'display_name', v.display_name) order by v.staff_id) eligible_staff
    from valid v group by v.starts_at, v.ends_at, v.local_start
  )
  select coalesce(jsonb_agg(jsonb_build_object('starts_at', starts_at, 'ends_at', ends_at,
    'local_time', to_char(local_start, 'HH24:MI'), 'staff_ids', staff_ids,
    'assigned_staff_id', assigned_staff_id, 'staff', eligible_staff) order by starts_at), '[]'::jsonb)
  into result from slots;

  result := jsonb_build_object('date', p_date, 'timezone', zone,
    'service', jsonb_build_object('id', s.id, 'name', s.name, 'duration_minutes', s.duration_minutes,
      'buffer_before_minutes', s.buffer_before_minutes, 'buffer_after_minutes', s.buffer_after_minutes),
    'scheduling_interval_minutes', b.scheduling_interval_minutes, 'slots', coalesce(result, '[]'::jsonb));
  if p_diagnostics then
    result := result || jsonb_build_object('diagnostics', jsonb_build_object(
      'business_hours', coalesce((select jsonb_agg(jsonb_build_object('opens_at', opens_at, 'closes_at', closes_at)
        order by opens_at) from public.business_hours where branch_id = branch_id_value and weekday = weekday_no), '[]'),
      'staff_hours', coalesce((select jsonb_agg(jsonb_build_object('staff_id', st.id, 'display_name', st.display_name,
        'starts_at', wh.starts_at, 'ends_at', wh.ends_at) order by st.display_name, wh.starts_at)
        from public.staff st join public.staff_branch_assignments a on a.staff_id = st.id
          and a.branch_id = branch_id_value and a.active
        join public.staff_services ss on ss.staff_id = st.id and ss.service_id = s.id
          and ss.branch_id = branch_id_value and ss.active
        join public.staff_working_hours wh on wh.staff_id = st.id and wh.branch_id = branch_id_value
          and wh.weekday = weekday_no
        where st.active and st.published and st.bookable and (p_staff is null or st.id = p_staff)), '[]'),
      'closures', coalesce((select jsonb_agg(jsonb_build_object('starts_at', starts_at, 'ends_at', ends_at,
        'reason', public_reason) order by starts_at) from public.business_closures where branch_id = branch_id_value
        and tstzrange(starts_at, ends_at, '[)') && tstzrange(p_date::timestamp at time zone zone,
          (p_date + 1)::timestamp at time zone zone, '[)')), '[]'),
      'exceptions', coalesce((select jsonb_agg(jsonb_build_object('staff_id', staff_id, 'kind', kind,
        'starts_at', starts_at, 'ends_at', ends_at, 'reason', reason) order by starts_at)
        from public.staff_schedule_exceptions where (branch_id = branch_id_value or is_global)
          and (not is_global or private.is_owner())
          and starts_at < (p_date + 1)::timestamp at time zone zone
          and ends_at > p_date::timestamp at time zone zone and (p_staff is null or staff_id = p_staff)), '[]'),
      'blocked_intervals', coalesce((select jsonb_agg(jsonb_build_object('staff_id', staff_id,
        'starts_at', lower(occupied_range), 'ends_at', upper(occupied_range), 'state', state) order by starts_at)
        from public.appointments where branch_id = branch_id_value
          and starts_at < (p_date + 1)::timestamp at time zone zone
          and ends_at > p_date::timestamp at time zone zone
          and state in ('ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW')
          and (state <> 'AWAITING_PAYMENT' or payment_due_at > clock_timestamp())
          and (p_staff is null or staff_id = p_staff)), '[]')));
  end if;
  return result;
end;
$$;

revoke all on function private.default_active_branch_id(), private.ensure_default_branch(),
  private.bootstrap_default_branch(), private.sync_default_branch_from_business_settings(),
  private.guard_branch_activation(), private.seed_service_branch_offering(),
  private.reject_branch_delete(),
  private.seed_staff_branch_assignment(), private.seed_new_admin_branch_membership(),
  private.guard_admin_role_write(),
  private.default_branch_on_insert(), private.default_exception_branch_on_insert(),
  private.prevent_branch_reassignment(), private.guard_branch_service_override(),
  private.enforce_appointment_branch(), private.guard_staff_service_assignment(),
  private.guard_appointment_item_branch(), private.guard_membership_assignment(),
  private.guard_staff_assignment(), private.guard_customer_auth_linkage(), private.guard_staff_deactivation(),
  private.has_single_active_default_branch() from public, anon, authenticated, service_role;
revoke all on function private.can_admin_access_branch(uuid), private.can_staff_access_branch(uuid,uuid),
  private.can_access_branch(uuid) from public, anon, authenticated;
grant execute on function private.can_admin_access_branch(uuid), private.can_staff_access_branch(uuid,uuid),
  private.can_access_branch(uuid) to authenticated, service_role;
revoke all on function public.is_public_branch(uuid), public.has_public_default_branch(), public.is_public_service_offering(uuid,uuid),
  public.is_public_service(uuid), public.is_public_staff(uuid) from public, anon, authenticated, service_role;
grant execute on function public.is_public_branch(uuid), public.has_public_default_branch(), public.is_public_service_offering(uuid,uuid),
  public.is_public_service(uuid), public.is_public_staff(uuid) to anon, authenticated, service_role;

grant execute on function private.default_active_branch_id() to service_role;

-- Preserve the application's global staff/time exclusion; only weekly-hours
-- overlap is local to a branch because it is not a reservation.
create index appointments_branch_state_start_idx on public.appointments(branch_id, state, starts_at desc);
create index appointments_branch_customer_start_idx on public.appointments(branch_id, customer_id, starts_at desc);
create index booking_policy_branch_version_idx on public.booking_policy_versions(branch_id, version desc);
create index business_hours_branch_weekday_idx on public.business_hours(branch_id, weekday, opens_at);
create index business_closures_branch_start_idx on public.business_closures(branch_id, starts_at);
create index staff_hours_branch_staff_weekday_idx on public.staff_working_hours(branch_id, staff_id, weekday);
create index staff_exceptions_branch_staff_start_idx on public.staff_schedule_exceptions(branch_id, staff_id, starts_at);
create index audit_logs_branch_created_idx on public.audit_logs(branch_id, created_at desc);

-- Branch authorization is database-backed and always checks the current role
-- plus current membership/assignment. A membership alone grants no role.
alter table public.branches enable row level security;
alter table public.branch_booking_settings enable row level security;
alter table public.branch_services enable row level security;
alter table public.admin_branch_memberships enable row level security;
alter table public.staff_branch_assignments enable row level security;
revoke all on public.branches, public.branch_booking_settings, public.branch_services,
  public.admin_branch_memberships, public.staff_branch_assignments from anon, authenticated;
grant select on public.branches to authenticated;
grant select, insert, update on public.branch_booking_settings, public.branch_services to authenticated;
grant select, insert, update on public.admin_branch_memberships, public.staff_branch_assignments to authenticated;
grant all on public.branches, public.branch_booking_settings, public.branch_services,
  public.admin_branch_memberships, public.staff_branch_assignments to service_role;

create policy branch_authorized_read on public.branches for select to authenticated
  using ((select private.can_access_branch(id)));
create policy branch_booking_settings_read on public.branch_booking_settings for select to authenticated
  using ((select private.can_admin_access_branch(branch_id)));
create policy branch_booking_settings_insert on public.branch_booking_settings for insert to authenticated
  with check ((select private.can_admin_access_branch(branch_id)));
create policy branch_booking_settings_update on public.branch_booking_settings for update to authenticated
  using ((select private.can_admin_access_branch(branch_id)))
  with check ((select private.can_admin_access_branch(branch_id)));
create policy branch_services_read on public.branch_services for select to authenticated
  using ((select private.can_admin_access_branch(branch_id)));
create policy branch_services_insert on public.branch_services for insert to authenticated
  with check ((select private.can_admin_access_branch(branch_id)));
create policy branch_services_update on public.branch_services for update to authenticated
  using ((select private.can_admin_access_branch(branch_id)))
  with check ((select private.can_admin_access_branch(branch_id)));
create policy branch_services_delete on public.branch_services for delete to authenticated
  using ((select private.can_admin_access_branch(branch_id)));
create policy admin_membership_read on public.admin_branch_memberships for select to authenticated
  using ((select private.is_owner()) or (auth_user_id = (select auth.uid()) and exists(
    select 1 from public.user_roles r where r.auth_user_id = auth.uid() and r.role = 'ADMIN')));
create policy owner_membership_insert on public.admin_branch_memberships for insert to authenticated
  with check ((select private.is_owner()));
create policy owner_membership_update on public.admin_branch_memberships for update to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));
create policy staff_assignment_read on public.staff_branch_assignments for select to authenticated
  using ((select private.is_owner()) or (select private.can_admin_access_branch(branch_id)) or
    (select private.can_staff_access_branch(staff_id, branch_id)));
create policy owner_staff_assignment_insert on public.staff_branch_assignments for insert to authenticated
  with check ((select private.is_owner()));
create policy owner_staff_assignment_update on public.staff_branch_assignments for update to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));

-- A published business row alone is not enough: all direct public reads of
-- business-wide projections must also respect the default branch's visibility
-- and booking switch. Admin management policies remain separate.
drop policy published_read on public.business_settings;
create policy published_read on public.business_settings for select to anon, authenticated
  using (published and public.has_public_default_branch());
drop policy published_read on public.website_settings;
create policy published_read on public.website_settings for select to anon, authenticated
  using (published and public.has_public_default_branch());
drop policy published_read on public.service_categories;
create policy published_read on public.service_categories for select to anon, authenticated
  using (published and active and public.has_public_default_branch());
drop policy published_read on public.announcements;
create policy published_read on public.announcements for select to anon, authenticated
  using (published and starts_at <= now() and (ends_at is null or ends_at > now())
    and public.has_public_default_branch());

-- Replace broad legacy RLS predicates on branch-bearing rows.
drop policy published_read on public.booking_policy_versions;
drop policy admin_read on public.booking_policy_versions;
drop policy admin_policy_insert on public.booking_policy_versions;
create policy published_read on public.booking_policy_versions for select to anon, authenticated
  using (published and public.is_public_branch(branch_id));
create policy branch_admin_policy_read on public.booking_policy_versions for select to authenticated
  using ((select private.can_admin_access_branch(branch_id)));
create policy branch_admin_policy_insert on public.booking_policy_versions for insert to authenticated
  with check ((select private.can_admin_access_branch(branch_id)));

drop policy public_hours on public.business_hours;
drop policy admin_insert on public.business_hours;
drop policy admin_update on public.business_hours;
drop policy admin_delete on public.business_hours;
create policy public_hours on public.business_hours for select to anon, authenticated
  using (public.is_public_branch(branch_id));
create policy branch_admin_hours_read on public.business_hours for select to authenticated
  using ((select private.can_admin_access_branch(branch_id)));
create policy branch_admin_hours_insert on public.business_hours for insert to authenticated
  with check ((select private.can_admin_access_branch(branch_id)));
create policy branch_admin_hours_update on public.business_hours for update to authenticated
  using ((select private.can_admin_access_branch(branch_id)))
  with check ((select private.can_admin_access_branch(branch_id)));
create policy branch_admin_hours_delete on public.business_hours for delete to authenticated
  using ((select private.can_admin_access_branch(branch_id)));

drop policy public_closures on public.business_closures;
drop policy admin_insert on public.business_closures;
drop policy admin_update on public.business_closures;
drop policy admin_delete on public.business_closures;
create policy public_closures on public.business_closures for select to anon, authenticated
  using (public.is_public_branch(branch_id));
create policy branch_admin_closures_read on public.business_closures for select to authenticated
  using ((select private.can_admin_access_branch(branch_id)));
create policy branch_admin_closure_insert on public.business_closures for insert to authenticated
  with check ((select private.can_admin_access_branch(branch_id)));
create policy branch_admin_closure_update on public.business_closures for update to authenticated
  using ((select private.can_admin_access_branch(branch_id)))
  with check ((select private.can_admin_access_branch(branch_id)));
create policy branch_admin_closure_delete on public.business_closures for delete to authenticated
  using ((select private.can_admin_access_branch(branch_id)));

drop policy staff_hours_read on public.staff_working_hours;
drop policy admin_insert on public.staff_working_hours;
drop policy admin_update on public.staff_working_hours;
drop policy admin_delete on public.staff_working_hours;
create policy staff_hours_read on public.staff_working_hours for select to authenticated
  using ((select private.can_admin_access_branch(branch_id)) or
    (select private.can_staff_access_branch(staff_id, branch_id)));
create policy branch_admin_staff_hours_insert on public.staff_working_hours for insert to authenticated
  with check ((select private.can_admin_access_branch(branch_id)));
create policy branch_admin_staff_hours_update on public.staff_working_hours for update to authenticated
  using ((select private.can_admin_access_branch(branch_id)))
  with check ((select private.can_admin_access_branch(branch_id)));
create policy branch_admin_staff_hours_delete on public.staff_working_hours for delete to authenticated
  using ((select private.can_admin_access_branch(branch_id)));

drop policy staff_exceptions_read on public.staff_schedule_exceptions;
drop policy admin_insert on public.staff_schedule_exceptions;
drop policy admin_update on public.staff_schedule_exceptions;
drop policy admin_delete on public.staff_schedule_exceptions;
create policy staff_exceptions_read on public.staff_schedule_exceptions for select to authenticated
  using ((branch_id is not null and ((select private.can_admin_access_branch(branch_id)) or
    (select private.can_staff_access_branch(staff_id, branch_id)))) or
    (is_global and (select private.is_owner())));
create policy branch_admin_exception_insert on public.staff_schedule_exceptions for insert to authenticated
  with check ((is_global and (select private.is_owner())) or
    (not is_global and branch_id is not null and (select private.can_admin_access_branch(branch_id))));
create policy branch_admin_exception_update on public.staff_schedule_exceptions for update to authenticated
  using ((branch_id is not null and (select private.can_admin_access_branch(branch_id))) or
    (is_global and (select private.is_owner())))
  with check ((is_global and (select private.is_owner())) or
    (not is_global and branch_id is not null and (select private.can_admin_access_branch(branch_id))));
create policy branch_admin_exception_delete on public.staff_schedule_exceptions for delete to authenticated
  using ((branch_id is not null and (select private.can_admin_access_branch(branch_id))) or
    (is_global and (select private.is_owner())));

drop policy appointment_read on public.appointments;
create policy appointment_read on public.appointments for select to authenticated
  using (private.can_read_appointment(id));

drop policy public_staff_services on public.staff_services;
drop policy admin_staff_services on public.staff_services;
drop policy admin_insert on public.staff_services;
drop policy admin_update on public.staff_services;
drop policy admin_delete on public.staff_services;
create policy public_staff_services on public.staff_services for select to anon, authenticated
  using (active and public.is_public_branch(branch_id)
    and public.is_public_service_offering(branch_id, service_id)
    and exists(select 1 from public.staff s where s.id = staff_id and s.active and s.published)
    and exists(select 1 from public.services s where s.id = service_id and s.active and s.published));
create policy branch_admin_staff_services_read on public.staff_services for select to authenticated
  using ((select private.can_admin_access_branch(branch_id)) or
    (select private.can_staff_access_branch(staff_id, branch_id)));
create policy branch_admin_staff_services_insert on public.staff_services for insert to authenticated
  with check ((select private.can_admin_access_branch(branch_id)));
create policy branch_admin_staff_services_update on public.staff_services for update to authenticated
  using ((select private.can_admin_access_branch(branch_id)))
  with check ((select private.can_admin_access_branch(branch_id)));
create policy branch_admin_staff_services_delete on public.staff_services for delete to authenticated
  using ((select private.can_admin_access_branch(branch_id)));

drop policy published_read on public.services;
create policy published_read on public.services for select to anon, authenticated
  using (published and active and public.is_public_service(id) and
    (category_id is null or exists(select 1 from public.service_categories c
      where c.id = category_id and c.active and c.published)));

drop policy staff_public_read on public.staff;
drop policy staff_management_read on public.staff;
create policy staff_public_read on public.staff for select to anon, authenticated
  using (published and active and public.is_public_staff(id));
create policy staff_management_read on public.staff for select to authenticated
  using ((select private.is_owner()) or exists(select 1 from public.staff_branch_assignments a
    where a.staff_id = id and private.can_admin_access_branch(a.branch_id)) or private.is_assigned_staff(id));

drop policy payment_read on public.payments;
create policy payment_read on public.payments for select to authenticated using (
  exists(select 1 from public.appointments a where a.id = appointment_id
    and (private.can_admin_access_branch(a.branch_id) or private.owns_customer(a.customer_id)))
);
drop policy refund_read on public.refunds;
create policy refund_read on public.refunds for select to authenticated using (
  exists(select 1 from public.payments p join public.appointments a on a.id = p.appointment_id
    where p.id = payment_id and (private.can_admin_access_branch(a.branch_id) or private.owns_customer(a.customer_id)))
);
drop policy audit_read on public.audit_logs;
create policy audit_read on public.audit_logs for select to authenticated using (
  (branch_id is not null and private.can_admin_access_branch(branch_id)) or
  (branch_id is null and (select private.is_owner()))
);

-- Role rows are account-wide identity data. Branch Admins can inspect their
-- own role but do not receive a deployment-wide user-role directory.
drop policy role_read on public.user_roles;
create policy role_read on public.user_roles for select to authenticated
  using (auth_user_id = (select auth.uid()) or (select private.is_owner()));

-- Customer identity rows are account-wide, while an ADMIN's authority is
-- branch-scoped. Keep self-service profile creation, but never let an ADMIN
-- attach an arbitrary auth account to a customer row. Admin updates must be
-- backed by an appointment in a branch assigned to that ADMIN.
drop policy customer_insert on public.customers;
create policy customer_insert on public.customers for insert to authenticated
  with check (auth_user_id = (select auth.uid()) and (select private.is_active_user()));
drop policy customer_update on public.customers;
create policy customer_update on public.customers for update to authenticated
  using (private.owns_customer(id) or (select private.is_owner()) or exists(
    select 1 from public.appointments a where a.customer_id = customers.id
      and private.can_admin_access_branch(a.branch_id)
  ))
  with check (private.owns_customer(id) or (select private.is_owner()) or exists(
    select 1 from public.appointments a where a.customer_id = customers.id
      and private.can_admin_access_branch(a.branch_id)
  ));

-- Remove any table-level UPDATE grant inherited from deployment defaults,
-- then keep only the intended self/Admin contact-field write surface.
revoke update on public.customers from public, anon, authenticated;
revoke update (id, auth_user_id, created_at, updated_at)
  on public.customers from public, anon, authenticated;
grant update (display_name, email, phone) on public.customers to authenticated;

drop policy appointment_home_location_select on public.appointment_home_locations;
create policy appointment_home_location_select on public.appointment_home_locations for select to authenticated using (
  exists(select 1 from public.appointments a where a.id = appointment_id and (
    (a.state not in ('PENDING','DECLINED','CANCELLED') and private.can_manage_appointment(a.id)) or
    private.can_admin_access_branch(a.branch_id) or private.owns_customer(a.customer_id)
  ))
);

create or replace function private.validate_schedule(p_staff uuid, p_start timestamptz, p_end timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare branch_id_value uuid; tz text; local_start timestamp; local_end timestamp; day_number integer;
begin
  branch_id_value := private.default_active_branch_id();
  select timezone into tz from public.branches where id = branch_id_value;
  if tz is null then raise exception 'Branch settings must be configured'; end if;
  local_start := p_start at time zone tz;
  local_end := p_end at time zone tz;
  if local_start::date <> local_end::date then raise exception 'Overnight appointments are not supported in this phase'; end if;
  day_number := extract(dow from local_start)::integer;
  if not exists(select 1 from public.business_hours h where h.branch_id = branch_id_value
    and h.weekday = day_number and h.opens_at <= local_start::time and h.closes_at >= local_end::time)
  then raise exception 'Outside business hours'; end if;
  if not (exists(select 1 from public.staff_working_hours h where h.staff_id = p_staff
      and h.branch_id = branch_id_value and h.weekday = day_number
      and h.starts_at <= local_start::time and h.ends_at >= local_end::time)
    or exists(select 1 from public.staff_schedule_exceptions e where e.staff_id = p_staff
      and e.branch_id = branch_id_value and not e.is_global and e.kind = 'EXTRA_HOURS'
      and e.starts_at <= p_start and e.ends_at >= p_end))
  then raise exception 'Outside staff working hours'; end if;
  if exists(select 1 from public.business_closures c where c.branch_id = branch_id_value
      and tstzrange(c.starts_at, c.ends_at, '[)') && tstzrange(p_start, p_end, '[)'))
    or exists(select 1 from public.staff_schedule_exceptions e where e.staff_id = p_staff
      and (e.branch_id = branch_id_value or e.is_global) and e.kind = 'UNAVAILABLE'
      and tstzrange(e.starts_at, e.ends_at, '[)') && tstzrange(p_start, p_end, '[)'))
  then raise exception 'Slot intersects a closure or staff absence'; end if;
end;
$$;

create or replace function private.audit_management_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare row_id uuid; row_data jsonb; branch_id_value uuid; details_value jsonb;
begin
  if tg_op = 'DELETE' then row_data := to_jsonb(old);
  else row_data := to_jsonb(new); end if;
  row_id := nullif(row_data->>'id','')::uuid;
  if row_id is null then row_id := coalesce(nullif(row_data->>'service_id','')::uuid,
    nullif(row_data->>'staff_id','')::uuid, nullif(row_data->>'branch_id','')::uuid); end if;
  branch_id_value := nullif(row_data->>'branch_id','')::uuid;
  if tg_table_name = 'user_roles' then
    details_value := jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new));
  else
    details_value := jsonb_build_object('operation', tg_op);
  end if;
  insert into public.audit_logs(actor_id, action, entity_table, entity_id, branch_id, details)
  values(auth.uid(), tg_op, tg_table_name, row_id, branch_id_value, details_value);
  return coalesce(new, old);
end;
$$;

create or replace function private.broadcast_app_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform realtime.send('{}'::jsonb, 'refresh', 'app:changes', true);
  exception when others then
    raise warning 'Realtime application invalidation failed for %.%', tg_table_schema, tg_table_name;
  end;
  if tg_table_schema = 'public' and tg_table_name = any(array[
    'business_settings','booking_policy_versions','website_settings','service_categories','services',
    'staff','staff_services','business_hours','staff_working_hours','staff_schedule_exceptions',
    'business_closures','appointments','appointment_items','announcements','branches',
    'branch_booking_settings','branch_services'
  ]::text[]) then
    begin
      perform realtime.send('{}'::jsonb, 'refresh', 'public:changes', true);
    exception when others then
      raise warning 'Realtime public-site invalidation failed for %.%', tg_table_schema, tg_table_name;
    end;
  end if;
  return null;
end;
$$;

create trigger touch_updated_at before update on public.branches
for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.branch_booking_settings
for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.branch_services
for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.admin_branch_memberships
for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.staff_branch_assignments
for each row execute function private.touch_updated_at();

create trigger audit_management_change after insert or update or delete on public.branch_booking_settings
for each row execute function private.audit_management_change();
create trigger audit_management_change after insert or update or delete on public.branch_services
for each row execute function private.audit_management_change();
create trigger audit_management_change after insert or update or delete on public.admin_branch_memberships
for each row execute function private.audit_management_change();
create trigger audit_management_change after insert or update or delete on public.staff_branch_assignments
for each row execute function private.audit_management_change();

create trigger app_data_invalidation after insert or update or delete or truncate on public.branches
for each statement execute function private.broadcast_app_change();
create trigger app_data_invalidation after insert or update or delete or truncate on public.branch_booking_settings
for each statement execute function private.broadcast_app_change();
create trigger app_data_invalidation after insert or update or delete or truncate on public.branch_services
for each statement execute function private.broadcast_app_change();
create trigger app_data_invalidation after insert or update or delete or truncate on public.admin_branch_memberships
for each statement execute function private.broadcast_app_change();
create trigger app_data_invalidation after insert or update or delete or truncate on public.staff_branch_assignments
for each statement execute function private.broadcast_app_change();

grant execute on function private.audit_management_change(), private.broadcast_app_change() to service_role;
-- Authenticated execution is required by the hardened admin diagnostics RPC;
-- p_diagnostics checks current OWNER/ADMIN authority and MFA inside the function.
revoke all on function private.calculate_availability(uuid,date,uuid,boolean) from public, anon, authenticated, service_role;
grant execute on function private.calculate_availability(uuid,date,uuid,boolean) to authenticated, service_role;
revoke all on function private.default_active_branch_id(), private.ensure_default_branch(),
  private.bootstrap_default_branch(), private.sync_default_branch_from_business_settings(),
  private.guard_branch_activation(), private.seed_service_branch_offering(),
  private.reject_branch_delete(),
  private.seed_staff_branch_assignment(), private.seed_new_admin_branch_membership(),
  private.guard_admin_role_write(),
  private.default_branch_on_insert(), private.default_exception_branch_on_insert(),
  private.prevent_branch_reassignment(), private.guard_branch_service_override(),
  private.enforce_appointment_branch(), private.guard_staff_service_assignment(),
  private.guard_appointment_item_branch(), private.guard_membership_assignment(),
  private.guard_staff_assignment(), private.guard_customer_auth_linkage(), private.guard_staff_deactivation(),
  private.has_single_active_default_branch(), private.audit_management_change(),
  private.broadcast_app_change() from public, anon, authenticated;

-- Verify the historical backfill before declaring the operational columns firm.
do $$
begin
  if exists(select 1 from public.booking_policy_versions where branch_id is null)
    or exists(select 1 from public.staff_services where branch_id is null)
    or exists(select 1 from public.business_hours where branch_id is null)
    or exists(select 1 from public.business_closures where branch_id is null)
    or exists(select 1 from public.staff_working_hours where branch_id is null)
    or exists(select 1 from public.staff_schedule_exceptions where (is_global and branch_id is not null) or (not is_global and branch_id is null))
    or exists(select 1 from public.appointments where branch_id is null) then
    raise exception 'Branch backfill validation failed; migration stopped';
  end if;
  if exists(select 1 from public.appointments a join public.payments p on p.appointment_id = a.id
    where a.branch_id is null) then
    raise exception 'Payment-to-appointment branch attribution validation failed';
  end if;
end;
$$;

comment on table public.branches is 'Branch locations inside one dedicated business database. Phase 1 permits only the active default branch.';
comment on table public.branch_booking_settings is 'Branch-specific approval controls; global registration and client identity remain business-wide.';
comment on table public.branch_services is 'Branch service offerings and optional commercial overrides; payment records remain attributed through appointments.';
comment on table public.admin_branch_memberships is 'Current ADMIN role plus active membership are both required for branch access. Rows are retained after revocation.';
comment on table public.staff_branch_assignments is 'Staff branch eligibility. Existing appointment-level operational rules remain required.';
comment on column public.staff_schedule_exceptions.is_global is 'Only UNAVAILABLE leave may be global; existing unavailable rows retain their legacy all-branch meaning.';
comment on column public.appointments.branch_id is 'Immutable authoritative branch. Payments derive branch through this appointment; staff overlap remains global.';
comment on function public.is_public_branch(uuid) is 'Safe boolean used to filter public branch-bound rows; does not expose branch configuration.';
