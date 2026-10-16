-- Home Service is an explicit branch choice. Legacy coverage data remains for
-- compatibility, but is no longer part of booking eligibility.
alter table public.branches add column home_service_enabled boolean not null default false;

create function public.owner_set_home_service_enabled(p_branch uuid, p_enabled boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_owner() then raise exception 'Owner access with MFA required' using errcode = '42501'; end if;
  if p_branch is null or p_enabled is null then raise exception 'Choose a branch and setting' using errcode = '22023'; end if;
  update public.branches set home_service_enabled = p_enabled, updated_at = clock_timestamp() where id = p_branch;
  if not found then raise exception 'Branch not found' using errcode = '22023'; end if;
  return p_enabled;
end;
$$;
revoke all on function public.owner_set_home_service_enabled(uuid,boolean) from public, anon;
grant execute on function public.owner_set_home_service_enabled(uuid,boolean) to authenticated;

-- Keep the existing public catalog shape and add an explicit branch flag.
-- Services available only at home disappear while that branch is disabled.
do $$
declare definition text;
begin
  select pg_get_functiondef('private.public_booking_data(text)'::regprocedure) into definition;
  if position('s.supports_business_location, s.supports_home_service,' in definition) = 0
    or position('''timezone'', selected.timezone, ''approval_mode'', approval_mode)' in definition) = 0 then
    raise exception 'Unexpected public booking catalog definition';
  end if;
  definition := replace(definition,
    's.supports_business_location, s.supports_home_service,',
    's.supports_business_location, (s.supports_home_service and selected.home_service_enabled) as supports_home_service,');
  definition := replace(definition,
    '''timezone'', selected.timezone, ''approval_mode'', approval_mode)',
    '''timezone'', selected.timezone, ''approval_mode'', approval_mode, ''home_service_enabled'', selected.home_service_enabled)');
  definition := replace(definition,
    'where bs.branch_id = selected.id and bs.active and s.active and s.published',
    'where bs.branch_id = selected.id and bs.active and s.active and s.published and (s.supports_business_location or (selected.home_service_enabled and s.supports_home_service))');
  execute definition;
end;
$$;

-- Reject disabled Home Service and guest availability at the database boundary.
do $$
declare definition text; first_pos integer; end_pos integer;
begin
  select pg_get_functiondef('private.calculate_public_branch_availability(text,uuid,date,uuid,text,numeric,numeric)'::regprocedure) into definition;
  if position('if auth.uid() is null and not b.guest_booking_enabled then' in definition) = 0 then
    raise exception 'Unexpected branch availability guest guard';
  end if;
  definition := replace(definition,
    'if auth.uid() is null and not b.guest_booking_enabled then',
    'if p_fulfillment = ''HOME_SERVICE'' and not br.home_service_enabled then return jsonb_build_object(''date'', p_date, ''timezone'', br.timezone, ''slots'', ''[]''::jsonb); end if; if (auth.uid() is null and (p_fulfillment = ''HOME_SERVICE'' or not b.guest_booking_enabled)) or (p_fulfillment = ''HOME_SERVICE'' and exists(select 1 from public.user_roles where auth_user_id=auth.uid() and role in (''OWNER'',''ADMIN'',''STAFF''))) then');
  first_pos := position('if br.home_service_max_radius_km is not null then' in definition);
  end_pos := position('zone := br.timezone;' in definition);
  if first_pos = 0 or end_pos <= first_pos then raise exception 'Unexpected branch availability coverage block'; end if;
  definition := left(definition, first_pos - 1) || 'end if; ' || substring(definition from end_pos);
  execute definition;
end;
$$;

-- The service-role booking RPC is still the trusted entry point. It now
-- requires a verified customer identity for home visits and checks the branch
-- flag before any idempotent return or new booking.
do $$
declare definition text; first_pos integer; end_pos integer;
begin
  select pg_get_functiondef('private.server_public_branch_booking_submit(text,uuid,uuid,timestamptz,uuid,text,text,text,uuid,text,text,numeric,numeric,text,text,text)'::regprocedure) into definition;
  if position('perform set_config(''request.jwt.claim.sub'',coalesce(p_auth_user::text,'''')' in definition) = 0 then
    raise exception 'Unexpected branch booking identity guard';
  end if;
  definition := replace(definition,
    'perform set_config(''request.jwt.claim.sub'',coalesce(p_auth_user::text,'''')',
    'if p_fulfillment = ''HOME_SERVICE'' and p_auth_user is null then raise exception ''Sign in to book Home Service'' using errcode = ''42501''; end if; if p_fulfillment = ''HOME_SERVICE'' and exists(select 1 from public.user_roles where auth_user_id=p_auth_user and role in (''OWNER'',''ADMIN'',''STAFF'')) then raise exception ''A customer account is required for Home Service'' using errcode = ''42501''; end if; perform set_config(''request.jwt.claim.sub'',coalesce(p_auth_user::text,'''')');
  definition := replace(definition,
    'if b.id is null or not b.published or br.id is null then raise exception ''This branch is not accepting bookings'' using errcode = ''42501''; end if;',
    'if b.id is null or not b.published or br.id is null then raise exception ''This branch is not accepting bookings'' using errcode = ''42501''; end if; if p_fulfillment = ''HOME_SERVICE'' and not br.home_service_enabled then raise exception ''Home Service is disabled at this branch'' using errcode = ''42501''; end if;');
  first_pos := position('if p_fulfillment=''HOME_SERVICE'' and br.home_service_max_radius_km is not null and' in definition);
  end_pos := position('if p_auth_user is null then' in substring(definition from first_pos));
  if first_pos = 0 or end_pos = 0 then raise exception 'Unexpected branch booking coverage block'; end if;
  end_pos := first_pos + end_pos - 1;
  definition := left(definition, first_pos - 1) || substring(definition from end_pos);
  execute definition;
end;
$$;

-- The earlier single-branch RPC remains callable by trusted legacy clients.
-- Give it the same account requirement and ignore its legacy radius settings.
do $$
declare definition text; first_pos integer; end_pos integer;
begin
  select pg_get_functiondef('private.server_home_service_booking_submit(uuid,uuid,timestamptz,uuid,text,text,text,uuid,text,numeric,numeric,text,text,text)'::regprocedure) into definition;
  if position('if p_address is null or length(trim(p_address))' in definition) = 0 then
    raise exception 'Unexpected legacy Home Service booking guard';
  end if;
  definition := replace(definition, 'if p_address is null or length(trim(p_address))',
    'if p_auth_user is null then raise exception ''Sign in to book Home Service'' using errcode = ''42501''; end if; if exists(select 1 from public.user_roles where auth_user_id=p_auth_user and role in (''OWNER'',''ADMIN'',''STAFF'')) then raise exception ''A customer account is required for Home Service'' using errcode = ''42501''; end if; if not exists(select 1 from public.branches where is_default and home_service_enabled) then raise exception ''Home Service is disabled at this branch'' using errcode = ''42501''; end if; if p_address is null or length(trim(p_address))');
  first_pos := position('if b.home_service_max_radius_km is not null then' in definition);
  end_pos := position('perform set_config(' in definition);
  if first_pos = 0 or end_pos <= first_pos then raise exception 'Unexpected legacy Home Service coverage block'; end if;
  definition := left(definition, first_pos - 1) || substring(definition from end_pos);
  execute definition;
end;
$$;

-- Only the latest staff coordinate is retained. No client can read or write
-- this private table; all access flows through role-checked RPCs.
create table private.home_service_trip_sessions (
  appointment_id uuid primary key references public.appointments(id) on delete cascade,
  staff_id uuid not null references public.staff(id),
  branch_id uuid not null references public.branches(id),
  latitude numeric(9,6), longitude numeric(9,6),
  active boolean not null default false,
  started_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp(),
  ended_at timestamptz,
  constraint trip_latitude_check check (latitude is null or latitude between -90 and 90),
  constraint trip_longitude_check check (longitude is null or longitude between -180 and 180),
  constraint trip_coordinate_pair_check check ((latitude is null) = (longitude is null))
);
alter table private.home_service_trip_sessions enable row level security;
revoke all on private.home_service_trip_sessions from public, anon, authenticated;
create index home_service_trip_active_branch_idx on private.home_service_trip_sessions(branch_id, expires_at) where active;

create function private.expire_home_service_trips() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update private.home_service_trip_sessions set active=false, latitude=null, longitude=null,
    ended_at=clock_timestamp(), updated_at=clock_timestamp()
    where active and expires_at <= clock_timestamp();
end;
$$;
revoke all on function private.expire_home_service_trips() from public, anon, authenticated, service_role;

create function public.home_service_trip_control(p_appointment uuid, p_action text,
  p_latitude numeric default null, p_longitude numeric default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare appointment public.appointments; actor_staff uuid; stamp timestamptz := clock_timestamp();
begin
  perform private.expire_home_service_trips();
  select * into appointment from public.appointments where id=p_appointment for update;
  select id into actor_staff from public.staff where auth_user_id=auth.uid() and active limit 1;
  if auth.uid() is null or appointment.id is null or appointment.fulfillment_mode <> 'HOME_SERVICE'
    or actor_staff is null or actor_staff <> appointment.staff_id
    or not private.can_staff_access_branch(actor_staff,appointment.branch_id) then
    raise exception 'Assigned staff access required' using errcode='42501';
  end if;
  if p_action = 'STOP' then
    update private.home_service_trip_sessions set active=false, latitude=null, longitude=null,
      ended_at=stamp, updated_at=stamp, expires_at=stamp where appointment_id=p_appointment;
    return jsonb_build_object('active',false);
  end if;
  if p_action not in ('START','UPDATE') or appointment.state::text not in
    ('ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS') then
    raise exception 'Trip is unavailable for this appointment' using errcode='42501';
  end if;
  if p_latitude is null or p_longitude is null or p_latitude not between -90 and 90
    or p_longitude not between -180 and 180 then raise exception 'Invalid trip coordinates' using errcode='22023'; end if;
  if p_action='START' then
    insert into private.home_service_trip_sessions(appointment_id,staff_id,branch_id,latitude,longitude,active,started_at,updated_at,expires_at,ended_at)
      values(p_appointment,actor_staff,appointment.branch_id,p_latitude,p_longitude,true,stamp,stamp,stamp+interval '90 seconds',null)
      on conflict(appointment_id) do update set staff_id=excluded.staff_id,branch_id=excluded.branch_id,
        latitude=excluded.latitude,longitude=excluded.longitude,active=true,started_at=stamp,
        updated_at=stamp,expires_at=stamp+interval '90 seconds',ended_at=null;
  else
    update private.home_service_trip_sessions set latitude=p_latitude,longitude=p_longitude,
      updated_at=stamp,expires_at=stamp+interval '90 seconds'
      where appointment_id=p_appointment and staff_id=actor_staff and active and expires_at>stamp;
    if not found then raise exception 'Trip has ended. Start a new trip to share again.' using errcode='55000'; end if;
  end if;
  return jsonb_build_object('active',true,'updated_at',stamp);
end;
$$;
revoke all on function public.home_service_trip_control(uuid,text,numeric,numeric) from public, anon;
grant execute on function public.home_service_trip_control(uuid,text,numeric,numeric) to authenticated;

create function public.home_service_trip_snapshot(p_area text, p_branch_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_staff uuid; result jsonb;
begin
  if p_area='admin' then
    if not private.can_admin_access_workspace(p_branch_id) then raise exception 'Admin with MFA required' using errcode='42501'; end if;
  elsif p_area='staff' then
    select id into actor_staff from public.staff where auth_user_id=auth.uid() and private.is_assigned_staff(id) limit 1;
    if actor_staff is null or (p_branch_id is not null and not private.can_staff_access_branch(actor_staff,p_branch_id)) then
      raise exception 'Assigned staff access required' using errcode='42501';
    end if;
  else raise exception 'Invalid Home Service workspace' using errcode='22023'; end if;
  perform private.expire_home_service_trips();
  select coalesce(jsonb_agg(jsonb_build_object('appointment_id',t.appointment_id,'staff_id',t.staff_id,
    'latitude',t.latitude,'longitude',t.longitude,'updated_at',t.updated_at,'expires_at',t.expires_at)), '[]'::jsonb)
    into result from private.home_service_trip_sessions t join public.appointments a on a.id=t.appointment_id
    where t.active and t.expires_at>clock_timestamp() and a.state::text in
      ('ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS')
      and a.staff_id=t.staff_id and a.branch_id=t.branch_id
      and (p_branch_id is null or a.branch_id=p_branch_id)
      and ((p_area='admin' and private.can_admin_access_branch(a.branch_id))
        or (p_area='staff' and a.staff_id=actor_staff and private.can_staff_access_branch(actor_staff,a.branch_id)));
  return result;
end;
$$;
revoke all on function public.home_service_trip_snapshot(text,uuid) from public, anon;
grant execute on function public.home_service_trip_snapshot(text,uuid) to authenticated;

create function private.stop_home_service_trip_on_appointment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.state::text not in ('ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS')
    or new.staff_id is distinct from old.staff_id then
    update private.home_service_trip_sessions set active=false,latitude=null,longitude=null,
      ended_at=clock_timestamp(),updated_at=clock_timestamp(),expires_at=clock_timestamp()
      where appointment_id=new.id and active;
  end if;
  return null;
end;
$$;
revoke all on function private.stop_home_service_trip_on_appointment() from public, anon, authenticated, service_role;
create trigger home_service_trip_appointment_stop after update of state,staff_id on public.appointments
  for each row execute function private.stop_home_service_trip_on_appointment();
create trigger app_data_invalidation after insert or update or delete on private.home_service_trip_sessions
  for each statement execute function private.broadcast_app_change();

comment on table private.home_service_trip_sessions is 'Current staff trip point only; no location history. Coordinates are cleared at stop, terminal booking state, or the next snapshot after expiry.';
