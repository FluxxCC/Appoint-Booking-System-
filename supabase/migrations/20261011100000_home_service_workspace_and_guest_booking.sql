-- Home Service destinations can be booked by a registered customer or guest.
-- Preserve the rest of the existing, branch-aware booking RPC unchanged.
do $$
declare
  definition text;
  original text := $needle$p_fulfillment = 'HOME_SERVICE' and (p_auth_user is null or p_address is null$needle$;
begin
  select pg_get_functiondef('private.server_public_branch_booking_submit(text,uuid,uuid,timestamptz,uuid,text,text,text,uuid,text,text,numeric,numeric,text,text,text)'::regprocedure)
    into definition;
  if position(original in definition) = 0 then
    raise exception 'Expected Home Service booking guard was not found';
  end if;
  definition := replace(definition, original, $replacement$p_fulfillment = 'HOME_SERVICE' and (p_address is null$replacement$);
  definition := replace(definition, 'A valid registered Home Service destination is required', 'A valid Home Service destination is required');
  execute definition;
end;
$$;

-- Keep the earlier single-branch trusted RPC consistent for existing callers.
do $$
declare
  definition text;
  original text := $needle$if p_auth_user is null then raise exception 'Home Service requires a registered customer account'; end if;$needle$;
begin
  select pg_get_functiondef('private.server_home_service_booking_submit(uuid,uuid,timestamptz,uuid,text,text,text,uuid,text,numeric,numeric,text,text,text)'::regprocedure)
    into definition;
  if position(original in definition) = 0 then
    raise exception 'Expected single-branch Home Service booking guard was not found';
  end if;
  definition := replace(definition, original, '');
  definition := replace(definition, 'set_config(''request.jwt.claim.sub'',p_auth_user::text,true)', 'set_config(''request.jwt.claim.sub'',coalesce(p_auth_user::text,''''),true)');
  execute definition;
end;
$$;

create function public.home_service_data_for_branch(
  p_area text,
  p_branch_id uuid default null,
  p_date date default null,
  p_status text default '',
  p_staff uuid default null,
  p_page integer default 1
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  staff_id_value uuid;
  active_count bigint;
  filtered_count bigint;
  selected_page integer := greatest(coalesce(p_page, 1), 1);
  rows_json jsonb;
  staff_options jsonb;
begin
  if p_area = 'admin' then
    if not private.can_admin_access_workspace(p_branch_id) then
      raise exception 'Admin with MFA required' using errcode = '42501';
    end if;
    perform set_config('app.workspace_branch_id', coalesce(p_branch_id::text, 'all-assigned'), true);
  elsif p_area = 'staff' then
    select s.id into staff_id_value from public.staff s
      where s.auth_user_id = auth.uid() and private.is_assigned_staff(s.id) limit 1;
    if auth.uid() is null or staff_id_value is null
      or (p_branch_id is not null and not private.can_staff_access_branch(staff_id_value, p_branch_id)) then
      raise exception 'Assigned staff access required' using errcode = '42501';
    end if;
    perform set_config('app.workspace_branch_id', coalesce(p_branch_id::text, ''), true);
    p_staff := staff_id_value;
  else
    raise exception 'Invalid Home Service workspace';
  end if;

  select count(*) into active_count
    from public.appointments a
    where a.fulfillment_mode = 'HOME_SERVICE'
      and a.state::text in ('PENDING','ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS')
      and (p_area <> 'staff' or a.staff_id = staff_id_value)
      and (p_area <> 'admin' or private.can_admin_access_branch(a.branch_id))
      and (p_branch_id is null or a.branch_id = p_branch_id);

  select count(*) into filtered_count
    from public.appointments a
    where a.fulfillment_mode = 'HOME_SERVICE'
      and a.state::text in ('PENDING','ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS')
      and (p_area <> 'staff' or a.staff_id = staff_id_value)
      and (p_area <> 'admin' or private.can_admin_access_branch(a.branch_id))
      and (p_branch_id is null or a.branch_id = p_branch_id)
      and (p_date is null or (a.starts_at at time zone coalesce((select b.timezone from public.branches b where b.id=a.branch_id), 'UTC'))::date = p_date)
      and (coalesce(p_status, '') = '' or a.state::text = p_status)
      and (p_area <> 'admin' or p_staff is null or a.staff_id = p_staff);

  with page_rows as (
    select a.id, a.public_reference, a.customer_id, a.staff_id, a.branch_id, a.starts_at, a.ends_at,
      a.state::text as state, a.fulfillment_mode::text as fulfillment_mode, a.service_area_hint,
      a.home_service_fee_snapshot::text as home_service_fee_snapshot, a.total_amount::text as total_amount,
      a.currency, c.display_name as customer_name,
      case when p_area = 'admin' then c.email else null end as customer_email,
      case when p_area = 'admin' then c.phone else null end as customer_phone,
      s.display_name as staff_name, b.name as branch_name, b.timezone,
      (select string_agg(i.service_name_snapshot, ', ' order by i.id)
        from public.appointment_items i where i.appointment_id=a.id) as service_name,
      h.address, h.latitude::text as latitude, h.longitude::text as longitude, h.landmark, h.instructions
    from public.appointments a
      join public.customers c on c.id=a.customer_id
      join public.staff s on s.id=a.staff_id
      join public.branches b on b.id=a.branch_id
      left join public.appointment_home_locations h on h.appointment_id=a.id
        and (p_area = 'admin' or a.state::text in ('ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS'))
    where a.fulfillment_mode = 'HOME_SERVICE'
      and a.state::text in ('PENDING','ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS')
      and (p_area <> 'staff' or a.staff_id = staff_id_value)
      and (p_area <> 'admin' or private.can_admin_access_branch(a.branch_id))
      and (p_branch_id is null or a.branch_id = p_branch_id)
      and (p_date is null or (a.starts_at at time zone b.timezone)::date = p_date)
      and (coalesce(p_status, '') = '' or a.state::text = p_status)
      and (p_area <> 'admin' or p_staff is null or a.staff_id = p_staff)
    order by a.starts_at, a.id
    limit 25 offset ((selected_page - 1) * 25)
  )
  select coalesce(jsonb_agg(to_jsonb(page_rows)), '[]'::jsonb) into rows_json from page_rows;

  if p_area = 'admin' then
    select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'display_name', x.display_name) order by x.display_name), '[]'::jsonb)
      into staff_options
      from (select distinct s.id, s.display_name from public.staff s
        join public.appointments a on a.staff_id=s.id
        where a.fulfillment_mode='HOME_SERVICE' and a.state::text in ('PENDING','ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS')
          and private.can_admin_access_branch(a.branch_id) and (p_branch_id is null or a.branch_id=p_branch_id)) x;
  else
    staff_options := '[]'::jsonb;
  end if;

  return jsonb_build_object('active_count', active_count, 'total', filtered_count, 'page', selected_page,
    'appointments', rows_json, 'staff_options', staff_options);
end;
$$;

revoke all on function public.home_service_data_for_branch(text,uuid,date,text,uuid,integer) from public, anon;
grant execute on function public.home_service_data_for_branch(text,uuid,date,text,uuid,integer) to authenticated;
