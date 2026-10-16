-- Phase 3: transaction-local branch context for protected operational reads.
-- The context only narrows RLS-visible rows. Membership and role checks remain
-- the authorization boundary, and an empty context means all rows already
-- authorized by the caller's existing policies.

-- A current ADMIN membership on any assigned branch must establish workspace
-- access. The Phase 1 single-default bootstrap predicate prevented an ADMIN
-- assigned only to another branch from reaching branch-aware read RPCs.
create or replace function private.is_admin()
returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_owner() or (
    private.is_active_user()
    and coalesce(auth.jwt()->>'aal' = 'aal2', false)
    and exists(select 1 from public.user_roles r where r.auth_user_id = auth.uid() and r.role = 'ADMIN')
    and case nullif(current_setting('app.workspace_branch_id', true), '')
      when 'all-assigned' then exists(select 1 from public.admin_branch_memberships m
        where m.auth_user_id = auth.uid() and m.active)
      else case
        when nullif(current_setting('app.workspace_branch_id', true), '') is not null then
          private.can_admin_access_branch(nullif(current_setting('app.workspace_branch_id', true), '')::uuid)
        else (private.has_single_active_default_branch() and exists(select 1 from public.admin_branch_memberships m join public.branches b on b.id = m.branch_id
          where m.auth_user_id = auth.uid() and m.active and b.is_default and b.is_active)
          or (not exists(select 1 from public.branches) and not exists(select 1 from public.business_settings)))
      end
    end
  );
$$;

create or replace function private.workspace_context_active()
returns boolean
language sql stable security invoker set search_path = '' as $$
  select nullif(current_setting('app.workspace_branch_id', true), '') is not null;
$$;

create or replace function private.can_admin_access_workspace(p_branch uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select case when p_branch is not null then private.can_admin_access_branch(p_branch)
    else private.is_owner() or (private.is_active_user()
      and coalesce(auth.jwt()->>'aal' = 'aal2', false)
      and exists(select 1 from public.user_roles r where r.auth_user_id = auth.uid() and r.role = 'ADMIN')
      and exists(select 1 from public.admin_branch_memberships m
        where m.auth_user_id = auth.uid() and m.active)) end;
$$;

create or replace function private.workspace_branch_matches(p_branch uuid)
returns boolean
language plpgsql stable security invoker set search_path = '' as $$
declare selected_branch text;
begin
  selected_branch := nullif(current_setting('app.workspace_branch_id', true), '');
  if selected_branch is null then return true; end if;
  if selected_branch = 'all-assigned' then return private.can_access_branch(p_branch); end if;
  return p_branch is not null and p_branch::text = selected_branch;
exception when others then
  -- Malformed or unexpected transaction context must never broaden a query.
  return false;
end;
$$;

create or replace function private.workspace_appointment_matches(p_appointment uuid)
returns boolean
language sql stable security invoker set search_path = '' as $$
  select not private.workspace_context_active() or exists (
    select 1 from public.appointments a
    where a.id = p_appointment and private.workspace_branch_matches(a.branch_id)
  );
$$;

create or replace function private.workspace_payment_matches(p_payment uuid)
returns boolean
language sql stable security invoker set search_path = '' as $$
  select not private.workspace_context_active() or exists (
    select 1 from public.payments p join public.appointments a on a.id = p.appointment_id
    where p.id = p_payment and private.workspace_branch_matches(a.branch_id)
  );
$$;

create or replace function private.workspace_customer_matches(p_customer uuid)
returns boolean
language sql stable security invoker set search_path = '' as $$
  select not private.workspace_context_active() or exists (
    select 1 from public.appointments a
    where a.customer_id = p_customer and private.workspace_branch_matches(a.branch_id)
  );
$$;

create or replace function private.workspace_staff_matches(p_staff uuid)
returns boolean
language sql stable security invoker set search_path = '' as $$
  select not private.workspace_context_active() or exists (
    select 1 from public.staff_branch_assignments a
    where a.staff_id = p_staff and a.active and private.workspace_branch_matches(a.branch_id)
  );
$$;

create or replace function private.workspace_rows_with_branch_labels(p_rows jsonb, p_id_key text default 'id')
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(
    row_value || jsonb_build_object(
      'branch_id', coalesce(row_value->>'branch_id', a.branch_id::text),
      'branch_name', b.name
    ) order by ordinal
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) with ordinality as item(row_value, ordinal)
  left join public.appointments a on a.id = nullif(row_value->>p_id_key, '')::uuid
  left join public.branches b on b.id = coalesce(nullif(row_value->>'branch_id', '')::uuid, a.branch_id);
$$;

revoke all on function private.workspace_context_active(), private.workspace_branch_matches(uuid),
  private.workspace_appointment_matches(uuid), private.workspace_payment_matches(uuid),
  private.workspace_customer_matches(uuid), private.workspace_staff_matches(uuid),
  private.can_admin_access_workspace(uuid),
  private.workspace_rows_with_branch_labels(jsonb,text) from public, anon, authenticated;
grant execute on function private.workspace_context_active(), private.workspace_branch_matches(uuid),
  private.workspace_appointment_matches(uuid), private.workspace_payment_matches(uuid),
  private.workspace_customer_matches(uuid), private.workspace_staff_matches(uuid),
  private.can_admin_access_workspace(uuid),
  private.workspace_rows_with_branch_labels(jsonb,text) to authenticated;

-- Restrictive policies layer the selected branch on top of the established
-- role, membership, and appointment ownership policies. Without the private
-- transaction context, the existing single-branch and all-assigned behavior
-- is unchanged.
create policy workspace_context_branches on public.branches as restrictive
  for select to authenticated using (private.workspace_branch_matches(id));
create policy workspace_context_branch_booking_settings on public.branch_booking_settings as restrictive
  for select to authenticated using (private.workspace_branch_matches(branch_id));
create policy workspace_context_branch_services on public.branch_services as restrictive
  for select to authenticated using (private.workspace_branch_matches(branch_id));
create policy workspace_context_admin_memberships on public.admin_branch_memberships as restrictive
  for select to authenticated using (private.workspace_branch_matches(branch_id));
create policy workspace_context_staff_assignments on public.staff_branch_assignments as restrictive
  for select to authenticated using (private.workspace_branch_matches(branch_id));
create policy workspace_context_policy_versions on public.booking_policy_versions as restrictive
  for select to authenticated using (private.workspace_branch_matches(branch_id));
create policy workspace_context_business_hours on public.business_hours as restrictive
  for select to authenticated using (private.workspace_branch_matches(branch_id));
create policy workspace_context_business_closures on public.business_closures as restrictive
  for select to authenticated using (private.workspace_branch_matches(branch_id));
create policy workspace_context_staff_hours on public.staff_working_hours as restrictive
  for select to authenticated using (private.workspace_branch_matches(branch_id));
create policy workspace_context_staff_exceptions on public.staff_schedule_exceptions as restrictive
  for select to authenticated using (
    private.workspace_branch_matches(branch_id)
    or (is_global and private.is_owner() and private.workspace_context_active() and exists (
      select 1 from public.staff_branch_assignments a
      where a.staff_id = staff_schedule_exceptions.staff_id and a.active
        and private.workspace_branch_matches(a.branch_id)
    ))
  );
create policy workspace_context_staff_services on public.staff_services as restrictive
  for select to authenticated using (private.workspace_branch_matches(branch_id));
create policy workspace_context_audit_logs on public.audit_logs as restrictive
  for select to authenticated using (private.workspace_branch_matches(branch_id));
create policy workspace_context_appointments on public.appointments as restrictive
  for select to authenticated using (private.workspace_branch_matches(branch_id));
create policy workspace_context_appointment_items on public.appointment_items as restrictive
  for select to authenticated using (private.workspace_appointment_matches(appointment_id));
create policy workspace_context_appointment_events on public.appointment_events as restrictive
  for select to authenticated using (private.workspace_appointment_matches(appointment_id));
create policy workspace_context_appointment_notes on public.appointment_notes as restrictive
  for select to authenticated using (private.workspace_appointment_matches(appointment_id));
create policy workspace_context_home_locations on public.appointment_home_locations as restrictive
  for select to authenticated using (private.workspace_appointment_matches(appointment_id));
create policy workspace_context_guest_tokens on public.guest_access_tokens as restrictive
  for select to authenticated using (private.workspace_appointment_matches(appointment_id));
create policy workspace_context_payments on public.payments as restrictive
  for select to authenticated using (private.workspace_appointment_matches(appointment_id));
create policy workspace_context_refunds on public.refunds as restrictive
  for select to authenticated using (private.workspace_payment_matches(payment_id));
create policy workspace_context_payment_events on public.payment_events as restrictive
  for select to authenticated using (private.workspace_payment_matches(payment_id));
create policy workspace_context_notifications on public.notification_outbox as restrictive
  for select to authenticated using (private.workspace_appointment_matches(appointment_id));
create policy workspace_context_customers on public.customers as restrictive
  for select to authenticated using (private.workspace_customer_matches(id));
create policy workspace_context_staff on public.staff as restrictive
  for select to authenticated using (private.workspace_staff_matches(id));

create or replace function private.business_timezone()
returns text
language plpgsql stable security definer set search_path = '' as $$
declare branch_id uuid; branch_timezone text; staff_id_value uuid;
begin
  begin
    branch_id := nullif(current_setting('app.workspace_branch_id', true), '')::uuid;
  exception when invalid_text_representation then
    branch_id := null;
  end;
  if branch_id is not null and private.can_admin_access_branch(branch_id) then
    select b.timezone into branch_timezone from public.branches b where b.id = branch_id;
  elsif branch_id is not null then
    select s.id into staff_id_value from public.staff s
    where s.auth_user_id = auth.uid() and private.is_assigned_staff(s.id) limit 1;
    if private.can_staff_access_branch(staff_id_value, branch_id) then
      select b.timezone into branch_timezone from public.branches b where b.id = branch_id;
    end if;
  end if;
  return coalesce(branch_timezone, (select b.timezone from public.business_settings b limit 1), 'UTC');
end;
$$;

create function public.admin_data_for_branch(
  p_section text, p_branch_id uuid, p_id uuid default null, p_date date default null,
  p_status text default '', p_query text default '', p_page integer default 1
) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare
  result jsonb; key text; branch_timezone text; workspace_day date; call_date date;
  day_start timestamptz; day_end timestamptz; rows_json jsonb; row_count bigint;
begin
  if not private.can_admin_access_workspace(p_branch_id) then raise exception 'Admin with MFA required' using errcode = '42501'; end if;
  perform set_config('app.workspace_branch_id', coalesce(p_branch_id::text, 'all-assigned'), true);
  if p_branch_id is not null then
    select b.timezone into branch_timezone from public.branches b where b.id = p_branch_id;
  end if;
  workspace_day := coalesce(p_date, (now() at time zone coalesce(branch_timezone,
    (select b.timezone from public.business_settings b limit 1), 'UTC'))::date);
  call_date := case when p_date is not null then p_date
    when p_section in ('dashboard','reports','calendar') then workspace_day else null end;
  day_start := workspace_day::timestamp at time zone coalesce(branch_timezone,
    (select b.timezone from public.business_settings b limit 1), 'UTC');
  day_end := (workspace_day + 1)::timestamp at time zone coalesce(branch_timezone,
    (select b.timezone from public.business_settings b limit 1), 'UTC');
  result := public.admin_data(p_section, p_id, call_date, p_status, p_query, p_page);

  if branch_timezone is not null then
    result := jsonb_set(result, '{date}', to_jsonb(workspace_day), true);
    if jsonb_typeof(result->'business') = 'object' then
      result := jsonb_set(result, '{business,timezone}', to_jsonb(branch_timezone), true);
    end if;

    -- The legacy RPC uses the business-wide timezone for its daily boundaries.
    -- Rebuild date-filtered rows and today's counts using the selected branch's
    -- timezone while its RLS context is still active.
    if p_section in ('dashboard','reports') then
      result := jsonb_set(result, '{stats}', (
        select jsonb_build_object(
          'today', count(*) filter (where a.starts_at >= day_start and a.starts_at < day_end and a.state in ('ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS')),
          'pending', count(*) filter (where a.state = 'PENDING'),
          'payment_expired', count(*) filter (where a.payment_expired_at >= day_start and a.payment_expired_at < day_end and a.state = 'PAYMENT_EXPIRED'),
          'confirmed', count(*) filter (where a.starts_at >= day_start and a.starts_at < day_end and a.state = 'CONFIRMED'),
          'completed', count(*) filter (where a.starts_at >= day_start and a.starts_at < day_end and a.state = 'COMPLETED'),
          'no_show', count(*) filter (where a.starts_at >= day_start and a.starts_at < day_end and a.state = 'NO_SHOW'),
          'upcoming', count(*) filter (where a.starts_at >= now() and a.state in ('CONFIRMED','AWAITING_PAYMENT','CHECKED_IN','IN_PROGRESS'))
        ) from public.appointments a
      ), true);
    end if;
  end if;

  -- The original RPC joins service snapshots directly and can duplicate an
  -- appointment with multiple item rows. Rebuild operational lists once per
  -- appointment while retaining its full service-name snapshot.
  if p_section = 'dashboard' then
    with matched as (
      select a.*, c.display_name customer_name, s.display_name staff_name,
        (select string_agg(i.service_name_snapshot, ', ' order by i.id)
          from public.appointment_items i where i.appointment_id = a.id) service_name,
        coalesce((select sum(p.amount) from public.payments p where p.appointment_id = a.id and p.state = 'SUCCEEDED'), 0)::text collected_amount
      from public.appointments a join public.customers c on c.id = a.customer_id
      join public.staff s on s.id = a.staff_id
      where a.starts_at >= day_start and a.starts_at < day_end
        and a.state in ('ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS')
    ), paged as (select * from matched order by starts_at, id limit 25)
    select coalesce(jsonb_agg(paged), '[]'::jsonb) into rows_json from paged;
    result := jsonb_set(result, '{schedule}', rows_json, true);

    with matched as (
      select a.*, c.display_name customer_name, s.display_name staff_name,
        (select string_agg(i.service_name_snapshot, ', ' order by i.id)
          from public.appointment_items i where i.appointment_id = a.id) service_name,
        coalesce((select sum(p.amount) from public.payments p where p.appointment_id = a.id and p.state = 'SUCCEEDED'), 0)::text collected_amount
      from public.appointments a join public.customers c on c.id = a.customer_id
      join public.staff s on s.id = a.staff_id where a.state = 'PENDING'
    ), paged as (select * from matched order by starts_at desc, id limit 25)
    select coalesce(jsonb_agg(paged), '[]'::jsonb) into rows_json from paged;
    result := jsonb_set(result, '{pending}', rows_json, true);
  end if;
  if p_section in ('appointments','calendar','appointment') then
    with matched as (
      select a.*, c.display_name customer_name, s.display_name staff_name,
        (select string_agg(i.service_name_snapshot, ', ' order by i.id)
          from public.appointment_items i where i.appointment_id = a.id) service_name,
        coalesce((select sum(p.amount) from public.payments p where p.appointment_id = a.id and p.state = 'SUCCEEDED'), 0)::text collected_amount
      from public.appointments a join public.customers c on c.id = a.customer_id
      join public.staff s on s.id = a.staff_id
      where (p_section <> 'appointment' or a.id = p_id)
        and (p_section <> 'appointments' or p_date is null or (a.starts_at >= day_start and a.starts_at < day_end))
        and (p_section <> 'calendar' or (a.starts_at >= day_start and a.starts_at < day_end))
        and (p_status = '' or a.state::text = p_status)
        and (p_query = '' or position(lower(p_query) in lower(c.display_name || ' ' ||
          coalesce((select string_agg(i.service_name_snapshot, ', ') from public.appointment_items i where i.appointment_id = a.id),'') ||
          ' ' || s.display_name || ' ' || a.id::text)) > 0)
    ), paged as (
      select * from matched order by case when p_section = 'calendar' then starts_at end asc,
        case when p_section <> 'calendar' then starts_at end desc, id
      limit 25 offset (p_page - 1) * 25
    )
    select coalesce(jsonb_agg(paged), '[]'::jsonb), (select count(*) from matched)
      into rows_json, row_count from paged;
    result := jsonb_set(jsonb_set(result, '{appointments}', rows_json, true), '{total}', to_jsonb(row_count), true);
  end if;

  foreach key in array array['appointments','schedule','pending','upcoming'] loop
    if jsonb_typeof(result->key) = 'array' then
      result := jsonb_set(result, array[key], private.workspace_rows_with_branch_labels(result->key));
    end if;
  end loop;
  if jsonb_typeof(result->'payments') = 'array' then
    result := jsonb_set(result, '{payments}', private.workspace_rows_with_branch_labels(result->'payments','appointment_id'));
  end if;
  if p_branch_id is not null then result := result - 'activity'; end if;
  return result;
end;
$$;

create function public.admin_customer_directory_for_branch(
  p_kind text, p_branch_id uuid, p_query text default '', p_page integer default 1
) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare result jsonb;
begin
  if not private.can_admin_access_workspace(p_branch_id) then raise exception 'Admin with MFA required' using errcode = '42501'; end if;
  perform set_config('app.workspace_branch_id', coalesce(p_branch_id::text, 'all-assigned'), true);
  result := public.admin_customer_directory(p_kind, p_query, p_page);
  return result;
end;
$$;

create function public.catalog_data_for_branch(
  p_kind text, p_branch_id uuid, p_id uuid default null, p_query text default '',
  p_category uuid default null, p_active text default '', p_page integer default 1
) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare result jsonb;
begin
  if not private.can_admin_access_workspace(p_branch_id) then raise exception 'Admin with MFA required' using errcode = '42501'; end if;
  perform set_config('app.workspace_branch_id', coalesce(p_branch_id::text, 'all-assigned'), true);
  result := public.catalog_data(p_kind, p_id, p_query, p_category, p_active, p_page);
  if p_branch_id is not null then
    result := result || jsonb_build_object('branch_id', p_branch_id,
      'branch_name', (select b.name from public.branches b where b.id = p_branch_id),
      'branch_offerings', coalesce((select jsonb_agg(jsonb_build_object(
        'service_id', bs.service_id, 'active', bs.active, 'price_override', bs.price_override,
        'service_name', s.name, 'effective_price', coalesce(bs.price_override, s.price_amount)
      ) order by s.name, s.id)
      from public.branch_services bs join public.services s on s.id = bs.service_id
      where bs.branch_id = p_branch_id), '[]'::jsonb));
  end if;
  return result;
end;
$$;

create function public.my_staff_workspace_for_branch(p_branch_id uuid default null)
returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare staff_id_value uuid; result jsonb; key text;
begin
  select s.id into staff_id_value from public.staff s where private.is_assigned_staff(s.id) limit 1;
  if auth.uid() is null or staff_id_value is null then
    raise exception 'Active assigned staff required' using errcode = '42501';
  end if;
  if p_branch_id is not null and not private.can_staff_access_branch(staff_id_value, p_branch_id) then
    raise exception 'Branch access denied' using errcode = '42501';
  end if;
  perform set_config('app.workspace_branch_id', coalesce(p_branch_id::text, ''), true);
  result := public.my_staff_workspace();
  foreach key in array array['today','pending','confirmed','upcoming'] loop
    if jsonb_typeof(result->key) = 'array' then
      result := jsonb_set(result, array[key], private.workspace_rows_with_branch_labels(result->key));
    end if;
  end loop;
  if p_branch_id is not null then
    result := result || jsonb_build_object('branch_id', p_branch_id,
      'branch_name', (select b.name from public.branches b where b.id = p_branch_id));
  end if;
  return result;
end;
$$;

revoke all on function public.admin_data_for_branch(text,uuid,uuid,date,text,text,integer),
  public.admin_customer_directory_for_branch(text,uuid,text,integer),
  public.catalog_data_for_branch(text,uuid,uuid,text,uuid,text,integer),
  public.my_staff_workspace_for_branch(uuid) from public, anon, authenticated;
grant execute on function public.admin_data_for_branch(text,uuid,uuid,date,text,text,integer),
  public.admin_customer_directory_for_branch(text,uuid,text,integer),
  public.catalog_data_for_branch(text,uuid,uuid,text,uuid,text,integer),
  public.my_staff_workspace_for_branch(uuid) to authenticated;

-- Schedule and service-assignment mutations require an explicit branch. The
-- old RPCs intentionally remain available for the legacy default-branch UI.
create or replace function private.branch_local_instant(p_local timestamp, p_branch uuid)
returns timestamptz
language plpgsql stable security definer set search_path = '' as $$
declare zone text; instant timestamptz;
begin
  if not private.can_admin_access_branch(p_branch) then
    raise exception 'Branch access denied' using errcode = '42501';
  end if;
  select timezone into zone from public.branches where id = p_branch;
  if zone is null or p_local is null or not isfinite(p_local) then
    raise exception 'Invalid branch-local time' using errcode = '22023';
  end if;
  instant := p_local at time zone zone;
  if instant at time zone zone <> p_local
    or exists(select 1 from generate_series(-180,180) m where m <> 0
      and (instant + make_interval(mins => m)) at time zone zone = p_local) then
    raise exception 'Invalid or ambiguous local time; choose another time' using errcode = '22023';
  end if;
  return instant;
end;
$$;
revoke all on function private.branch_local_instant(timestamp,uuid) from public, anon, authenticated, service_role;
grant execute on function private.branch_local_instant(timestamp,uuid) to authenticated;

create function public.admin_save_hours_for_branch(p_branch uuid, p_intervals jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not private.can_admin_access_branch(p_branch) then raise exception 'Branch access denied' using errcode = '42501'; end if;
  perform set_config('app.workspace_branch_id',p_branch::text,true);
  if p_intervals is null or jsonb_typeof(p_intervals) <> 'array' or jsonb_array_length(p_intervals) > 28 then
    raise exception 'Invalid hours' using errcode = '22023';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_intervals) x(weekday smallint, opens_at time, closes_at time)
    where weekday not between 0 and 6 or opens_at is null or closes_at is null or opens_at >= closes_at) then
    raise exception 'Invalid hours' using errcode = '22023';
  end if;
  perform private.lock_schedule();
  delete from public.business_hours where branch_id = p_branch;
  insert into public.business_hours(branch_id, weekday, opens_at, closes_at)
  select p_branch, weekday, opens_at, closes_at
  from jsonb_to_recordset(p_intervals) x(weekday smallint, opens_at time, closes_at time);
end;
$$;

create function public.admin_save_closure_for_branch(
  p_branch uuid, p_date date, p_full_day boolean, p_start time, p_end time, p_reason text
) returns void language plpgsql security invoker set search_path = '' as $$
declare starts_at_value timestamptz; ends_at_value timestamptz;
begin
  if not private.can_admin_access_branch(p_branch) then raise exception 'Branch access denied' using errcode = '42501'; end if;
  perform set_config('app.workspace_branch_id',p_branch::text,true);
  if p_date is null or not isfinite(p_date) or p_full_day is null
    or length(trim(coalesce(p_reason,''))) not between 1 and 500
    or (not p_full_day and (p_start is null or p_end is null or p_end <= p_start)) then
    raise exception 'Invalid closure' using errcode = '22023';
  end if;
  perform private.lock_schedule();
  starts_at_value := private.branch_local_instant(p_date + case when p_full_day then time '00:00' else p_start end, p_branch);
  ends_at_value := private.branch_local_instant(case when p_full_day then (p_date + 1)::timestamp else p_date + p_end end, p_branch);
  insert into public.business_closures(branch_id, starts_at, ends_at, public_reason)
  values(p_branch, starts_at_value, ends_at_value, trim(p_reason));
end;
$$;

create function public.admin_delete_closure_for_branch(p_branch uuid, p_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare removed integer;
begin
  if not private.can_admin_access_branch(p_branch) then raise exception 'Branch access denied' using errcode = '42501'; end if;
  perform set_config('app.workspace_branch_id',p_branch::text,true);
  perform private.lock_schedule();
  delete from public.business_closures where id = p_id and branch_id = p_branch;
  get diagnostics removed = row_count;
  return removed = 1;
end;
$$;

create function public.catalog_assign_services_for_branch(p_branch uuid, p_staff uuid, p_services jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not private.can_admin_access_branch(p_branch) then raise exception 'Branch access denied' using errcode = '42501'; end if;
  perform set_config('app.workspace_branch_id',p_branch::text,true);
  if p_services is null or jsonb_typeof(p_services) <> 'array' or jsonb_array_length(p_services) > 1000 then
    raise exception 'Invalid assignments' using errcode = '22023';
  end if;
  if not exists(select 1 from public.staff_branch_assignments a where a.staff_id = p_staff
    and a.branch_id = p_branch and a.active) then raise exception 'Staff is not assigned to this branch' using errcode = '42501'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_services) v(value)
    where not exists(select 1 from public.branch_services bs join public.services s on s.id = bs.service_id
      where bs.branch_id = p_branch and bs.service_id = v.value::uuid and bs.active and s.active)) then
    raise exception 'Service is not active for this branch' using errcode = '22023';
  end if;
  perform private.lock_schedule();
  update public.staff_services set active = false where staff_id = p_staff and branch_id = p_branch;
  insert into public.staff_services(staff_id, service_id, branch_id, active)
  select p_staff, value::uuid, p_branch, true from jsonb_array_elements_text(p_services)
  on conflict (staff_id, service_id, branch_id) do update set active = true;
end;
$$;

create function public.catalog_save_staff_hours_for_branch(p_branch uuid, p_staff uuid, p_intervals jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not private.can_admin_access_branch(p_branch) then raise exception 'Branch access denied' using errcode = '42501'; end if;
  perform set_config('app.workspace_branch_id',p_branch::text,true);
  if p_intervals is null or jsonb_typeof(p_intervals) <> 'array' or jsonb_array_length(p_intervals) > 28 then
    raise exception 'Invalid hours' using errcode = '22023';
  end if;
  if not exists(select 1 from public.staff_branch_assignments a where a.staff_id = p_staff
    and a.branch_id = p_branch and a.active) then raise exception 'Staff is not assigned to this branch' using errcode = '42501'; end if;
  if exists(select 1 from jsonb_to_recordset(p_intervals) x(weekday smallint, opens_at time, closes_at time)
    where weekday not between 0 and 6 or opens_at is null or closes_at is null or opens_at >= closes_at) then
    raise exception 'Invalid hours' using errcode = '22023';
  end if;
  perform private.lock_schedule();
  delete from public.staff_working_hours where staff_id = p_staff and branch_id = p_branch;
  insert into public.staff_working_hours(staff_id, branch_id, weekday, starts_at, ends_at)
  select p_staff, p_branch, weekday, opens_at, closes_at
  from jsonb_to_recordset(p_intervals) x(weekday smallint, opens_at time, closes_at time);
end;
$$;

create function public.catalog_save_exception_for_branch(
  p_branch uuid, p_staff uuid, p_kind public.schedule_exception_kind,
  p_start timestamp, p_end timestamp, p_reason text
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare exception_id uuid;
begin
  if not private.can_admin_access_branch(p_branch) then raise exception 'Branch access denied' using errcode = '42501'; end if;
  perform set_config('app.workspace_branch_id',p_branch::text,true);
  if not exists(select 1 from public.staff_branch_assignments a where a.staff_id = p_staff
    and a.branch_id = p_branch and a.active) then raise exception 'Staff is not assigned to this branch' using errcode = '42501'; end if;
  if p_start is null or p_end is null or p_start >= p_end or length(trim(coalesce(p_reason,''))) not between 1 and 500 then
    raise exception 'Invalid exception' using errcode = '22023';
  end if;
  perform private.lock_schedule();
  insert into public.staff_schedule_exceptions(staff_id, branch_id, is_global, kind, starts_at, ends_at, reason)
  values(p_staff, p_branch, false, p_kind, private.branch_local_instant(p_start,p_branch),
    private.branch_local_instant(p_end,p_branch), trim(p_reason)) returning id into exception_id;
  return exception_id;
end;
$$;

create function public.catalog_remove_exception_for_branch(p_branch uuid, p_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare removed integer;
begin
  if not private.can_admin_access_branch(p_branch) then raise exception 'Branch access denied' using errcode = '42501'; end if;
  perform set_config('app.workspace_branch_id',p_branch::text,true);
  perform private.lock_schedule();
  delete from public.staff_schedule_exceptions where id = p_id and branch_id = p_branch and not is_global;
  get diagnostics removed = row_count;
  return removed = 1;
end;
$$;

revoke all on function public.admin_save_hours_for_branch(uuid,jsonb),
  public.admin_save_closure_for_branch(uuid,date,boolean,time,time,text),
  public.admin_delete_closure_for_branch(uuid,uuid),
  public.catalog_assign_services_for_branch(uuid,uuid,jsonb),
  public.catalog_save_staff_hours_for_branch(uuid,uuid,jsonb),
  public.catalog_save_exception_for_branch(uuid,uuid,public.schedule_exception_kind,timestamp,timestamp,text),
  public.catalog_remove_exception_for_branch(uuid,uuid) from public, anon, authenticated;
grant execute on function public.admin_save_hours_for_branch(uuid,jsonb),
  public.admin_save_closure_for_branch(uuid,date,boolean,time,time,text),
  public.admin_delete_closure_for_branch(uuid,uuid),
  public.catalog_assign_services_for_branch(uuid,uuid,jsonb),
  public.catalog_save_staff_hours_for_branch(uuid,uuid,jsonb),
  public.catalog_save_exception_for_branch(uuid,uuid,public.schedule_exception_kind,timestamp,timestamp,text),
  public.catalog_remove_exception_for_branch(uuid,uuid) to authenticated;

-- Appointment lifecycle decisions must resolve the appointment's branch from
-- the locked row; a branch membership never authorizes another branch.
create or replace function private.validate_schedule_for_branch(
  p_staff uuid, p_branch uuid, p_start timestamptz, p_end timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
declare zone text; local_start timestamp; local_end timestamp; day_number integer;
begin
  select timezone into zone from public.branches where id = p_branch;
  if zone is null then raise exception 'Branch settings must be configured'; end if;
  local_start := p_start at time zone zone;
  local_end := p_end at time zone zone;
  if local_start::date <> local_end::date then raise exception 'Overnight appointments are not supported'; end if;
  day_number := extract(dow from local_start)::integer;
  if not exists(select 1 from public.business_hours h where h.branch_id = p_branch
    and h.weekday = day_number and h.opens_at <= local_start::time and h.closes_at >= local_end::time)
  then raise exception 'Outside business hours'; end if;
  if not (exists(select 1 from public.staff_working_hours h where h.staff_id = p_staff
      and h.branch_id = p_branch and h.weekday = day_number
      and h.starts_at <= local_start::time and h.ends_at >= local_end::time)
    or exists(select 1 from public.staff_schedule_exceptions e where e.staff_id = p_staff
      and e.branch_id = p_branch and not e.is_global and e.kind = 'EXTRA_HOURS'
      and e.starts_at <= p_start and e.ends_at >= p_end)) then raise exception 'Outside staff working hours'; end if;
  if exists(select 1 from public.business_closures c where c.branch_id = p_branch
      and tstzrange(c.starts_at,c.ends_at,'[)') && tstzrange(p_start,p_end,'[)'))
    or exists(select 1 from public.staff_schedule_exceptions e where e.staff_id = p_staff
      and (e.branch_id = p_branch or e.is_global) and e.kind = 'UNAVAILABLE'
      and tstzrange(e.starts_at,e.ends_at,'[)') && tstzrange(p_start,p_end,'[)')) then
    raise exception 'Slot intersects a closure or staff absence';
  end if;
end;
$$;
revoke all on function private.validate_schedule_for_branch(uuid,uuid,timestamptz,timestamptz)
  from public, anon, authenticated, service_role;

create or replace function private.protect_existing_schedule()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  for a in select staff_id, branch_id, occupied_range from public.appointments
    where ends_at > clock_timestamp() and state in ('ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS')
  loop
    perform private.validate_schedule_for_branch(a.staff_id,a.branch_id,lower(a.occupied_range),upper(a.occupied_range));
  end loop;
  return null;
end;
$$;

create or replace function private.acquire_appointment(p_appointment uuid, p_automatic boolean)
returns public.appointment_state language plpgsql security definer set search_path = '' as $$
declare a public.appointments; i public.appointment_items; pol public.booking_policy_versions;
  b public.business_settings; br public.branches; v_mode text; next_state public.appointment_state;
  accepted_time timestamptz; due_time timestamptz; local_start timestamp;
begin
  perform private.lock_schedule();
  perform private.expire_due_payments();
  select * into a from public.appointments where id = p_appointment for update;
  if not found then raise exception 'Appointment unavailable' using errcode = 'P0002'; end if;
  select * into b from public.business_settings limit 1;
  select * into br from public.branches where id = a.branch_id;
  select coalesce(s.approval_mode,b.booking_approval_mode,'ADMIN_APPROVAL') into v_mode
    from (select 1) x left join public.branch_booking_settings s on s.branch_id = a.branch_id;
  if br.id is null or not br.is_active or not br.booking_enabled or not br.public_visible then
    raise exception 'Branch is not accepting bookings' using errcode = '42501';
  end if;
  if p_automatic then
    if v_mode <> 'AUTO_CONFIRM' or pg_trigger_depth() < 1 then
      raise exception 'Automatic acceptance requires the booking workflow' using errcode = '42501';
    end if;
  elsif not (private.can_admin_access_branch(a.branch_id)
    or (v_mode = 'STAFF_APPROVAL' and private.can_staff_access_branch(a.staff_id,a.branch_id))) then
    raise exception 'Approval is not authorized for this booking' using errcode = '42501';
  end if;
  if a.state <> 'PENDING' then
    if not p_automatic and a.state in ('CONFIRMED','AWAITING_PAYMENT') then return a.state; end if;
    raise exception 'Only pending requests can be accepted' using errcode = '22023';
  end if;
  select * into pol from public.booking_policy_versions where id = a.policy_version_id and branch_id = a.branch_id;
  select * into i from public.appointment_items where appointment_id = a.id;
  if pol.id is null or i.id is null or b.id is null then raise exception 'Booking configuration is incomplete'; end if;
  if a.starts_at < clock_timestamp() + make_interval(mins => pol.minimum_notice_minutes)
    or a.starts_at > clock_timestamp() + make_interval(days => pol.maximum_advance_days) then
    raise exception 'Booking window has closed' using errcode = '22023';
  end if;
  if a.ends_at <> a.starts_at + make_interval(mins => i.duration_minutes)
    or a.buffer_before_minutes <> i.buffer_before_minutes or a.buffer_after_minutes <> i.buffer_after_minutes
    or a.total_amount <> i.price_amount + a.home_service_fee_snapshot then
    raise exception 'Booking snapshot is inconsistent';
  end if;
  if not exists(select 1 from public.services s join public.staff_services ss on ss.service_id = s.id
      join public.staff st on st.id = ss.staff_id
      join public.staff_branch_assignments ba on ba.staff_id = st.id and ba.branch_id = a.branch_id and ba.active
      join public.branch_services bs on bs.service_id = s.id and bs.branch_id = a.branch_id and bs.active
      where s.id = i.service_id and ss.staff_id = a.staff_id and ss.branch_id = a.branch_id
        and s.active and ss.active and st.active and st.bookable and st.published
        and (s.category_id is null or exists(select 1 from public.service_categories c where c.id = s.category_id and c.active))) then
    raise exception 'Staff or service is no longer available' using errcode = '22023';
  end if;
  local_start := a.starts_at at time zone br.timezone;
  if not exists(select 1 from public.business_hours h where h.branch_id = a.branch_id
      and h.weekday = extract(dow from local_start)::integer and h.opens_at <= local_start::time
      and h.closes_at > local_start::time
      and mod(extract(epoch from (local_start::time - h.opens_at))::integer,b.scheduling_interval_minutes * 60) = 0)
    or not private.valid_business_local_time(local_start,br.timezone) then
    raise exception 'Requested time is no longer on the schedule' using errcode = '22023';
  end if;
  perform private.validate_schedule_for_branch(a.staff_id,a.branch_id,lower(a.occupied_range),upper(a.occupied_range));
  if exists(select 1 from public.appointments x where x.id <> a.id and x.staff_id = a.staff_id
    and x.occupied_range && a.occupied_range
    and x.state in ('ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW')) then
    raise exception 'This time is no longer available' using errcode = '23P01';
  end if;
  accepted_time := clock_timestamp();
  update public.appointments set state = 'ACCEPTED', accepted_at = accepted_time,
    accepted_by = case when p_automatic then null else auth.uid() end,
    acceptance_source = case when p_automatic then 'AUTO' else 'MANUAL' end where id = a.id;
  if a.payment_mode_snapshot = 'PAY_AT_BUSINESS' then
    next_state := 'CONFIRMED'; update public.appointments set state = next_state where id = a.id;
  else
    due_time := least(accepted_time + make_interval(mins => pol.payment_window_minutes),a.starts_at);
    if due_time <= accepted_time then raise exception 'Payment window has closed' using errcode = '22023'; end if;
    next_state := 'AWAITING_PAYMENT';
    update public.appointments set state = next_state,payment_due_at = due_time where id = a.id;
  end if;
  return next_state;
end;
$$;

create or replace function private.transition_appointment(
  p_appointment uuid, p_target public.appointment_state, p_reason text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare a public.appointments; pol public.booking_policy_versions; manager boolean; operator_access boolean; approval_mode text;
begin
  if auth.uid() is null or not private.is_active_user() then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform private.lock_schedule();
  select * into a from public.appointments where id = p_appointment for update;
  if not found then raise exception 'Appointment unavailable' using errcode = 'P0002'; end if;
  select coalesce(s.approval_mode,b.booking_approval_mode,'ADMIN_APPROVAL') into approval_mode
    from public.business_settings b left join public.branch_booking_settings s on s.branch_id = a.branch_id limit 1;
  manager := private.can_admin_access_branch(a.branch_id)
    or (approval_mode = 'STAFF_APPROVAL' and private.can_staff_access_branch(a.staff_id,a.branch_id));
  operator_access := private.can_admin_access_branch(a.branch_id) or private.can_staff_access_branch(a.staff_id,a.branch_id);
  if p_target = 'DECLINED' then
    if not manager then raise exception 'Approval is not authorized for this booking' using errcode = '42501'; end if;
    if a.state = 'DECLINED' then return; end if;
  elsif not operator_access then
    if not private.owns_customer(a.customer_id) or p_target <> 'CANCELLED' then
      raise exception 'Not authorized' using errcode = '42501';
    end if;
    select * into pol from public.booking_policy_versions where id = a.policy_version_id;
    if a.state = 'CONFIRMED' and clock_timestamp() > a.starts_at - make_interval(mins => pol.cancellation_notice_minutes) then
      raise exception 'Cancellation window closed';
    end if;
  end if;
  if p_target not in ('DECLINED','CANCELLED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW') then
    raise exception 'Use the dedicated transition command';
  end if;
  if p_target = 'DECLINED' and coalesce(length(trim(p_reason)),0) < 10 then
    raise exception 'Provide a useful decline reason (at least 10 characters)';
  end if;
  if p_target = 'CANCELLED' and coalesce(length(trim(p_reason)),0) = 0 then raise exception 'Reason required'; end if;
  if p_target = 'NO_SHOW' then
    select * into pol from public.booking_policy_versions where id = a.policy_version_id;
    if clock_timestamp() < a.starts_at + make_interval(mins => pol.no_show_grace_minutes) then
      raise exception 'No-show grace period has not elapsed';
    end if;
  end if;
  update public.appointments set state = p_target,
    declined_by = case when p_target = 'DECLINED' then auth.uid() else declined_by end,
    declined_at = case when p_target = 'DECLINED' then clock_timestamp() else declined_at end,
    decline_reason = case when p_target = 'DECLINED' then trim(p_reason) else decline_reason end,
    cancelled_at = case when p_target = 'CANCELLED' then clock_timestamp() else cancelled_at end,
    cancellation_reason = case when p_target = 'CANCELLED' then trim(p_reason) else cancellation_reason end
  where id = a.id;
end;
$$;

create function private.calculate_availability_for_branch(
  p_branch uuid, p_service uuid, p_date date, p_staff uuid default null, p_diagnostics boolean default true
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  b public.business_settings; pol public.booking_policy_versions; s public.services;
  zone text; weekday_no integer; result jsonb; branch_id_value uuid;
begin
  if p_date is null or not isfinite(p_date) then raise exception 'Choose a valid date' using errcode = '22023'; end if;
  if not p_diagnostics or not private.can_admin_access_branch(p_branch) then raise exception 'Admin with MFA required' using errcode = '42501'; end if;
  select * into b from public.business_settings;
  branch_id_value := p_branch;
  select timezone into zone from public.branches where id = p_branch;
  if b.id is null or branch_id_value is null then raise exception 'Business configuration is incomplete'; end if;
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
revoke all on function private.calculate_availability_for_branch(uuid,uuid,date,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function private.calculate_availability_for_branch(uuid,uuid,date,uuid,boolean) to authenticated;

create function public.admin_availability_for_branch(p_branch uuid,p_service uuid,p_date date,p_staff uuid default null)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
begin
  if not private.can_admin_access_branch(p_branch) then raise exception 'Admin access with MFA is required' using errcode = '42501'; end if;
  perform set_config('app.workspace_branch_id',p_branch::text,true);
  return private.calculate_availability_for_branch(p_branch,p_service,p_date,p_staff,true);
end;
$$;
revoke all on function public.admin_availability_for_branch(uuid,uuid,date,uuid) from public,anon,authenticated;
grant execute on function public.admin_availability_for_branch(uuid,uuid,date,uuid) to authenticated;
