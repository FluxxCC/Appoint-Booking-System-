-- Phase 4: public catalog, availability, and booking bind to a database-validated branch.
-- Additional branch activation remains controlled by private.guard_branch_activation().

create or replace function private.public_booking_branch_is_eligible(p_branch uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.branches br
    join public.business_settings b on b.singleton and b.published
    join public.branch_booking_settings bbs on bbs.branch_id = br.id
    where br.id = p_branch and br.is_active and br.public_visible and br.booking_enabled
      and exists(select 1 from public.booking_policy_versions p
        where p.branch_id = br.id and p.published)
      and exists(select 1 from public.business_hours h where h.branch_id = br.id)
      and exists(
        select 1 from public.branch_services bs
        join public.services s on s.id = bs.service_id and s.active and s.published
        left join public.service_categories c on c.id = s.category_id
        join public.staff_services ss on ss.branch_id = bs.branch_id and ss.service_id = bs.service_id and ss.active
        join public.staff_branch_assignments ba on ba.branch_id = bs.branch_id and ba.staff_id = ss.staff_id and ba.active
        join public.staff st on st.id = ss.staff_id and st.active and st.published and st.bookable
        join public.staff_working_hours wh on wh.branch_id = bs.branch_id and wh.staff_id = st.id
        where bs.branch_id = br.id and bs.active
          and (s.category_id is null or (c.active and c.published))
      )
  );
$$;
revoke all on function private.public_booking_branch_is_eligible(uuid) from public, anon, authenticated, service_role;

create or replace function private.public_booking_data(p_branch_slug text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  b public.business_settings;
  selected public.branches;
  branch_count integer;
  branches_json jsonb;
  website_json jsonb;
  policy_json jsonb;
  categories_json jsonb;
  services_json jsonb;
  staff_json jsonb;
  assignments_json jsonb;
  hours_json jsonb;
  announcements_json jsonb;
  approval_mode text;
begin
  select * into b from public.business_settings where singleton limit 1;
  select count(*)::integer into branch_count from public.branches br
    where private.public_booking_branch_is_eligible(br.id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', br.slug, 'name', br.name, 'address', br.address,
    'contact_email', br.contact_email, 'contact_phone', br.contact_phone,
    'service_count', (select count(*)::integer from public.branch_services bs
      join public.services s on s.id = bs.service_id and s.active and s.published
      left join public.service_categories c on c.id = s.category_id
      where bs.branch_id = br.id and bs.active and (s.category_id is null or (c.active and c.published)))
  ) order by br.is_default desc, br.name), '[]'::jsonb)
  into branches_json
  from public.branches br where private.public_booking_branch_is_eligible(br.id);

  if p_branch_slug is not null and length(trim(p_branch_slug)) between 1 and 100 then
    select br.* into selected from public.branches br
    where br.slug = trim(p_branch_slug) and private.public_booking_branch_is_eligible(br.id);
  end if;
  if selected.id is null and branch_count = 1 then
    select br.* into selected from public.branches br where private.public_booking_branch_is_eligible(br.id) limit 1;
  end if;

  select coalesce((select jsonb_build_object('logo_path', w.logo_path, 'hero_image_path', w.hero_image_path,
    'primary_color', w.primary_color, 'font_key', w.font_key, 'sections', w.sections)
    from public.website_settings w where w.published limit 1), 'null'::jsonb) into website_json;

  if selected.id is not null then
    select coalesce(s.approval_mode, b.booking_approval_mode, 'ADMIN_APPROVAL') into approval_mode
      from (select 1) x left join public.branch_booking_settings s on s.branch_id = selected.id;
    select jsonb_build_object('terms', p.terms, 'minimum_notice_minutes', p.minimum_notice_minutes,
      'maximum_advance_days', p.maximum_advance_days, 'cancellation_notice_minutes', p.cancellation_notice_minutes)
      into policy_json from public.booking_policy_versions p where p.branch_id = selected.id and p.published
      order by p.version desc limit 1;
    select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug,
      'sort_order', c.sort_order) order by c.sort_order, c.name), '[]'::jsonb) into categories_json
      from public.service_categories c where c.active and c.published and exists(
        select 1 from public.branch_services bs join public.services s on s.id = bs.service_id
        where bs.branch_id = selected.id and bs.active and s.category_id = c.id and s.active and s.published);
    select coalesce(jsonb_agg(to_jsonb(x) order by x.name), '[]'::jsonb) into services_json from (
      select s.id, s.name, s.slug, s.description, s.image_path,
        coalesce(bs.price_override, s.price_amount) as price_amount,
        s.duration_minutes, s.category_id,
        coalesce(bs.payment_mode_override, s.payment_mode) as payment_mode,
        coalesce(bs.deposit_amount_override, s.deposit_amount) as deposit_amount,
        coalesce(bs.deposit_type_override, s.deposit_type) as deposit_type,
        coalesce(bs.deposit_percent_bps_override, s.deposit_percent_bps) as deposit_percent_bps,
        s.supports_business_location, s.supports_home_service,
        coalesce(bs.home_service_fee_override, s.home_service_fee) as home_service_fee,
        s.buffer_before_minutes, s.buffer_after_minutes,
        coalesce(bs.home_travel_before_minutes_override, s.home_travel_before_minutes) as home_travel_before_minutes,
        coalesce(bs.home_travel_after_minutes_override, s.home_travel_after_minutes) as home_travel_after_minutes
      from public.branch_services bs join public.services s on s.id = bs.service_id
      left join public.service_categories c on c.id = s.category_id
      where bs.branch_id = selected.id and bs.active and s.active and s.published
        and (s.category_id is null or (c.active and c.published))
    ) x;
    select coalesce(jsonb_agg(to_jsonb(x) order by x.display_name), '[]'::jsonb) into staff_json from (
      select distinct st.id, st.display_name, st.slug, st.bio, st.photo_path
      from public.staff st join public.staff_branch_assignments ba on ba.staff_id = st.id
        and ba.branch_id = selected.id and ba.active
      join public.staff_services ss on ss.staff_id = st.id and ss.branch_id = selected.id and ss.active
      join public.branch_services bs on bs.branch_id = selected.id and bs.service_id = ss.service_id and bs.active
      join public.services s on s.id = ss.service_id and s.active and s.published
      left join public.service_categories c on c.id = s.category_id
      where st.active and st.published and st.bookable and (s.category_id is null or (c.active and c.published))
    ) x;
    select coalesce(jsonb_agg(jsonb_build_object('staff_id', ss.staff_id, 'service_id', ss.service_id)
      order by ss.staff_id, ss.service_id), '[]'::jsonb) into assignments_json
      from public.staff_services ss
      join public.staff st on st.id = ss.staff_id and st.active and st.published and st.bookable
      join public.staff_branch_assignments ba on ba.staff_id = ss.staff_id and ba.branch_id = selected.id and ba.active
      join public.branch_services bs on bs.branch_id = selected.id and bs.service_id = ss.service_id and bs.active
      join public.services s on s.id = ss.service_id and s.active and s.published
      left join public.service_categories c on c.id = s.category_id
      where ss.branch_id = selected.id and ss.active and (s.category_id is null or (c.active and c.published));
    select coalesce(jsonb_agg(jsonb_build_object('weekday', h.weekday, 'opens_at', h.opens_at,
      'closes_at', h.closes_at) order by h.weekday, h.opens_at), '[]'::jsonb) into hours_json
      from public.business_hours h where h.branch_id = selected.id;
  else
    approval_mode := coalesce(b.booking_approval_mode, 'ADMIN_APPROVAL');
    policy_json := null;
    categories_json := '[]'::jsonb;
    services_json := '[]'::jsonb;
    staff_json := '[]'::jsonb;
    assignments_json := '[]'::jsonb;
    hours_json := '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('title', a.title, 'body', a.body,
    'starts_at', a.starts_at, 'ends_at', a.ends_at) order by a.starts_at desc), '[]'::jsonb)
    into announcements_json from public.announcements a where a.published and a.starts_at <= now()
      and (a.ends_at is null or a.ends_at > now());

  return jsonb_build_object(
    'business', case when b.published then jsonb_build_object('name', b.name, 'description', b.description,
      'timezone', coalesce(selected.timezone, b.timezone), 'currency', b.currency,
      'contact_email', coalesce(selected.contact_email, b.contact_email),
      'contact_phone', coalesce(selected.contact_phone, b.contact_phone),
      'address', coalesce(selected.address, b.address), 'guest_booking_enabled', b.guest_booking_enabled,
      'customer_registration_enabled', b.customer_registration_enabled, 'booking_approval_mode', approval_mode)
      else null end,
    'website', website_json,
    'branch', case when selected.id is null then null else jsonb_build_object('id', selected.id,
      'slug', selected.slug, 'name', selected.name, 'address', selected.address,
      'contact_email', selected.contact_email, 'contact_phone', selected.contact_phone,
      'timezone', selected.timezone, 'approval_mode', approval_mode) end,
    'branches', branches_json,
    'services', services_json, 'staff', staff_json, 'assignments', assignments_json,
    'categories', categories_json, 'hours', hours_json,
    'announcements', case when b.published then announcements_json else '[]'::jsonb end,
    'policy', policy_json,
    'refund_policy', (select p.refund_policy from public.business_settings p where p.singleton)
  );
end;
$$;

create or replace function public.public_booking_data(p_branch_slug text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.public_booking_data(p_branch_slug);
$$;
revoke all on function private.public_booking_data(text), public.public_booking_data(text) from public;
grant execute on function private.public_booking_data(text) to anon, authenticated;
grant execute on function public.public_booking_data(text) to anon, authenticated;

-- Public availability uses branch schedule and service overrides. Home Service
-- coordinates are used only in-memory for coverage and never returned or stored.
create function private.calculate_public_branch_availability(
  p_branch_slug text, p_service uuid, p_date date, p_staff uuid,
  p_fulfillment text, p_latitude numeric default null, p_longitude numeric default null
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  b public.business_settings; br public.branches; pol public.booking_policy_versions;
  svc record; zone text; weekday_no integer; result jsonb; slots_json jsonb;
  before_minutes integer; after_minutes integer; distance_km double precision;
  lat1 double precision; lat2 double precision;
begin
  if p_date is null or not isfinite(p_date) or p_service is null
    or p_fulfillment not in ('BUSINESS_LOCATION', 'HOME_SERVICE') then
    raise exception 'Invalid availability request' using errcode = '22023';
  end if;
  select * into b from public.business_settings where singleton limit 1;
  select x.* into br from public.branches x
    where x.slug = p_branch_slug and private.public_booking_branch_is_eligible(x.id) limit 1;
  if b.id is null or not b.published or br.id is null then
    return jsonb_build_object('date', p_date, 'timezone', coalesce(br.timezone, b.timezone, 'UTC'), 'slots', '[]'::jsonb);
  end if;
  if auth.uid() is null and not b.guest_booking_enabled then
    return jsonb_build_object('date', p_date, 'timezone', br.timezone, 'slots', '[]'::jsonb);
  end if;
  select * into pol from public.booking_policy_versions p
    where p.branch_id = br.id and p.published order by p.version desc limit 1;
  select s.*, coalesce(bs.price_override, s.price_amount) as effective_price,
    coalesce(bs.payment_mode_override, s.payment_mode) as effective_payment_mode,
    coalesce(bs.deposit_type_override, s.deposit_type) as effective_deposit_type,
    coalesce(bs.deposit_amount_override, s.deposit_amount) as effective_deposit_amount,
    coalesce(bs.deposit_percent_bps_override, s.deposit_percent_bps) as effective_deposit_percent_bps,
    coalesce(bs.home_service_fee_override, s.home_service_fee) as effective_home_fee,
    coalesce(bs.home_travel_before_minutes_override, s.home_travel_before_minutes) as effective_travel_before,
    coalesce(bs.home_travel_after_minutes_override, s.home_travel_after_minutes) as effective_travel_after
    into svc from public.services s join public.branch_services bs on bs.service_id = s.id and bs.branch_id = br.id and bs.active
    left join public.service_categories c on c.id = s.category_id
    where s.id = p_service and s.active and s.published
      and (s.category_id is null or (c.active and c.published))
      and ((p_fulfillment = 'BUSINESS_LOCATION' and s.supports_business_location)
        or (p_fulfillment = 'HOME_SERVICE' and s.supports_home_service));
  if svc.id is null or pol.id is null then
    return jsonb_build_object('date', p_date, 'timezone', br.timezone, 'slots', '[]'::jsonb);
  end if;
  if p_fulfillment = 'HOME_SERVICE' then
    if p_latitude is null or p_longitude is null or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
      return jsonb_build_object('date', p_date, 'timezone', br.timezone, 'slots', '[]'::jsonb);
    end if;
    if br.home_service_max_radius_km is not null then
      if br.service_origin_latitude is null or br.service_origin_longitude is null then
        return jsonb_build_object('date', p_date, 'timezone', br.timezone, 'slots', '[]'::jsonb);
      end if;
      lat1 := radians(p_latitude::double precision);
      lat2 := radians(br.service_origin_latitude::double precision);
      distance_km := 6371.0088 * 2 * asin(sqrt(least(1,
        power(sin((lat2-lat1)/2),2) + cos(lat1)*cos(lat2) *
        power(sin((radians(br.service_origin_longitude::double precision)-radians(p_longitude::double precision))/2),2))));
      if distance_km > br.home_service_max_radius_km then
        return jsonb_build_object('date', p_date, 'timezone', br.timezone, 'slots', '[]'::jsonb);
      end if;
    end if;
  end if;
  zone := br.timezone;
  weekday_no := extract(dow from p_date)::integer;
  before_minutes := svc.buffer_before_minutes + case when p_fulfillment = 'HOME_SERVICE' then coalesce(svc.effective_travel_before,0) else 0 end;
  after_minutes := svc.buffer_after_minutes + case when p_fulfillment = 'HOME_SERVICE' then coalesce(svc.effective_travel_after,0) else 0 end;
  if p_date < (clock_timestamp() at time zone zone)::date
    or p_date > ((clock_timestamp() + make_interval(days => pol.maximum_advance_days)) at time zone zone)::date then
    return jsonb_build_object('date', p_date, 'timezone', zone, 'service', jsonb_build_object('id', svc.id,
      'name', svc.name, 'duration_minutes', svc.duration_minutes, 'buffer_before_minutes', before_minutes,
      'buffer_after_minutes', after_minutes), 'scheduling_interval_minutes', b.scheduling_interval_minutes,
      'slots', '[]'::jsonb);
  end if;

  with eligible as (
    select st.id, st.display_name from public.staff st
    join public.staff_branch_assignments ba on ba.staff_id = st.id and ba.branch_id = br.id and ba.active
    join public.staff_services ss on ss.staff_id = st.id and ss.branch_id = br.id and ss.service_id = svc.id and ss.active
    where st.active and st.published and st.bookable and (p_staff is null or st.id = p_staff)
  ), grid as (
    select (p_date + h.opens_at + make_interval(mins => n * b.scheduling_interval_minutes))::timestamp local_start
    from public.business_hours h cross join lateral generate_series(0,288) series(n)
    where h.branch_id = br.id and h.weekday = weekday_no
      and p_date + h.opens_at + make_interval(mins => n * b.scheduling_interval_minutes) < p_date + h.closes_at
  ), instants as (
    select g.local_start, g.local_start at time zone zone starts_at,
      (g.local_start at time zone zone) + make_interval(mins => svc.duration_minutes) ends_at,
      tstzrange((g.local_start at time zone zone) - make_interval(mins => before_minutes),
        (g.local_start at time zone zone) + make_interval(mins => svc.duration_minutes + after_minutes), '[)') occupied
    from grid g where private.valid_business_local_time(g.local_start, zone)
      and private.valid_business_local_time(((g.local_start at time zone zone) - make_interval(mins => before_minutes)) at time zone zone, zone)
      and private.valid_business_local_time(((g.local_start at time zone zone) + make_interval(mins => svc.duration_minutes + after_minutes)) at time zone zone, zone)
  ), valid as (
    select e.id staff_id, e.display_name, i.local_start, i.starts_at, i.ends_at, i.occupied,
      (select count(*)::integer from public.appointments a where a.staff_id = e.id
        and a.starts_at >= p_date::timestamp at time zone zone and a.starts_at < (p_date+1)::timestamp at time zone zone
        and a.state in ('ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW')
        and (a.state <> 'AWAITING_PAYMENT' or a.payment_due_at > clock_timestamp())) as daily_load
    from eligible e cross join instants i
    where i.starts_at >= clock_timestamp() + make_interval(mins => pol.minimum_notice_minutes)
      and i.starts_at <= clock_timestamp() + make_interval(days => pol.maximum_advance_days)
      and exists(select 1 from public.business_hours h where h.branch_id = br.id and h.weekday = weekday_no
        and h.opens_at <= (lower(i.occupied) at time zone zone)::time and h.closes_at >= (upper(i.occupied) at time zone zone)::time
        and (lower(i.occupied) at time zone zone)::date = p_date and (upper(i.occupied) at time zone zone)::date = p_date)
      and (exists(select 1 from public.staff_working_hours h where h.staff_id = e.id and h.branch_id = br.id
          and h.weekday = weekday_no and h.starts_at <= (lower(i.occupied) at time zone zone)::time
          and h.ends_at >= (upper(i.occupied) at time zone zone)::time
          and (lower(i.occupied) at time zone zone)::date = p_date and (upper(i.occupied) at time zone zone)::date = p_date)
        or exists(select 1 from public.staff_schedule_exceptions ex where ex.staff_id = e.id
          and ex.branch_id = br.id and not ex.is_global and ex.kind = 'EXTRA_HOURS'
          and tstzrange(ex.starts_at, ex.ends_at, '[)') @> i.occupied))
      and not exists(select 1 from public.business_closures c where c.branch_id = br.id
        and tstzrange(c.starts_at,c.ends_at,'[)') && i.occupied)
      and not exists(select 1 from public.staff_schedule_exceptions ex where ex.staff_id = e.id
        and (ex.branch_id = br.id or ex.is_global) and ex.kind = 'UNAVAILABLE'
        and tstzrange(ex.starts_at,ex.ends_at,'[)') && i.occupied)
      and not exists(select 1 from public.appointments a where a.staff_id = e.id and a.occupied_range && i.occupied
        and a.state in ('ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW')
        and (a.state <> 'AWAITING_PAYMENT' or a.payment_due_at > clock_timestamp()))
  ), grouped as (
    select v.starts_at,v.ends_at,v.local_start,jsonb_agg(v.staff_id order by v.staff_id) staff_ids,
      (array_agg(v.staff_id order by v.daily_load,v.staff_id))[1] assigned_staff_id,
      jsonb_agg(jsonb_build_object('id',v.staff_id,'display_name',v.display_name) order by v.staff_id) staff
    from valid v group by v.starts_at,v.ends_at,v.local_start
  ) select coalesce(jsonb_agg(jsonb_build_object('starts_at',starts_at,'ends_at',ends_at,
      'local_time',to_char(local_start,'HH24:MI'),'staff_ids',staff_ids,
      'assigned_staff_id',assigned_staff_id,'staff',staff) order by starts_at),'[]'::jsonb)
    into slots_json from grouped;
  result := jsonb_build_object('date',p_date,'timezone',zone,'service',jsonb_build_object('id',svc.id,
    'name',svc.name,'duration_minutes',svc.duration_minutes,'buffer_before_minutes',before_minutes,
    'buffer_after_minutes',after_minutes),'scheduling_interval_minutes',b.scheduling_interval_minutes,
    'slots',coalesce(slots_json,'[]'::jsonb));
  return result;
end;
$$;
revoke all on function private.calculate_public_branch_availability(text,uuid,date,uuid,text,numeric,numeric) from public, anon, authenticated, service_role;

create function private.server_public_branch_availability(
  p_branch_slug text,p_service uuid,p_date date,p_staff uuid,p_auth_user uuid,
  p_fulfillment text,p_latitude numeric,p_longitude numeric
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role', true) <> 'service_role' then raise exception 'Not authorized' using errcode = '42501'; end if;
  perform set_config('request.jwt.claim.sub', coalesce(p_auth_user::text, ''), true);
  return private.calculate_public_branch_availability(p_branch_slug,p_service,p_date,p_staff,p_fulfillment,p_latitude,p_longitude);
end;
$$;
revoke all on function private.server_public_branch_availability(text,uuid,date,uuid,uuid,text,numeric,numeric) from public, anon, authenticated, service_role;
grant execute on function private.server_public_branch_availability(text,uuid,date,uuid,uuid,text,numeric,numeric) to service_role;
create function public.server_public_branch_availability(
  p_branch_slug text,p_service uuid,p_date date,p_staff uuid,p_auth_user uuid,
  p_fulfillment text,p_latitude numeric,p_longitude numeric
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.server_public_branch_availability(p_branch_slug,p_service,p_date,p_staff,p_auth_user,p_fulfillment,p_latitude,p_longitude);
$$;
revoke all on function public.server_public_branch_availability(text,uuid,date,uuid,uuid,text,numeric,numeric) from public, anon, authenticated;
grant execute on function public.server_public_branch_availability(text,uuid,date,uuid,uuid,text,numeric,numeric) to service_role;

-- Appointment attribution stays immutable; the trusted booking RPC may insert
-- into a validated public branch, and all later attempts to reassign it fail.
create or replace function private.enforce_appointment_branch() returns trigger
language plpgsql security definer set search_path = '' as $$
declare default_id uuid;
begin
  if tg_op = 'UPDATE' then
    if new.branch_id is distinct from old.branch_id then raise exception 'Appointment branch attribution is immutable' using errcode = '42501'; end if;
    return new;
  end if;
  default_id := private.default_active_branch_id();
  if new.branch_id is null then new.branch_id := default_id; end if;
  if new.branch_id is distinct from default_id and (
    current_setting('role', true) <> 'service_role'
    or current_setting('app.public_booking_branch_id', true) is distinct from new.branch_id::text
  ) then raise exception 'Booking branch must be selected through the public booking workflow' using errcode = '42501'; end if;
  if not exists(select 1 from public.business_settings b where b.singleton and b.published)
    or not public.is_public_branch(new.branch_id) then
    raise exception 'Online booking is unavailable for this branch' using errcode = '55000';
  end if;
  if not exists(select 1 from public.staff_branch_assignments a where a.staff_id = new.staff_id
    and a.branch_id = new.branch_id and a.active) then raise exception 'Staff is not assigned to the selected branch'; end if;
  return new;
end;
$$;

-- Approval is branch-scoped while retaining the legacy business-level default.
create or replace function private.guard_appointment() returns trigger
language plpgsql set search_path = '' as $$
declare allowed boolean := false; paid bigint; approval_mode text;
begin
  new.occupied_range := tstzrange(new.starts_at - make_interval(mins => new.buffer_before_minutes + new.home_travel_before_snapshot),
    new.ends_at + make_interval(mins => new.buffer_after_minutes + new.home_travel_after_snapshot), '[)');
  if tg_op = 'INSERT' then
    if new.state <> 'PENDING' or new.accepted_at is not null or new.accepted_by is not null
      or new.payment_due_at is not null or new.acceptance_source <> 'MANUAL' then raise exception 'New appointments must be pending and unpaid'; end if;
    return new;
  end if;
  if current_setting('app.home_booking_snapshot',true) is distinct from 'on' and
    (new.customer_id,new.staff_id,new.policy_version_id,new.request_key,new.starts_at,new.ends_at,
     new.buffer_before_minutes,new.buffer_after_minutes,new.currency,new.total_amount,new.payment_mode_snapshot,
     new.required_payment_amount,new.fulfillment_mode,new.home_service_fee_snapshot,new.home_travel_before_snapshot,
     new.home_travel_after_snapshot,new.service_area_hint)
    is distinct from
    (old.customer_id,old.staff_id,old.policy_version_id,old.request_key,old.starts_at,old.ends_at,
     old.buffer_before_minutes,old.buffer_after_minutes,old.currency,old.total_amount,old.payment_mode_snapshot,
     old.required_payment_amount,old.fulfillment_mode,old.home_service_fee_snapshot,old.home_travel_before_snapshot,
     old.home_travel_after_snapshot,old.service_area_hint)
  then raise exception 'Booking snapshots and intervals are immutable; rescheduling requires a future dedicated command'; end if;
  if old.accepted_at is not null and (new.accepted_at,new.accepted_by,new.acceptance_source) is distinct from (old.accepted_at,old.accepted_by,old.acceptance_source) then raise exception 'Acceptance evidence is immutable'; end if;
  if old.payment_due_at is not null and new.payment_due_at is distinct from old.payment_due_at then raise exception 'Payment deadline is immutable'; end if;
  if new.state = old.state then return new; end if;
  allowed := case old.state
    when 'PENDING' then new.state in ('ACCEPTED','DECLINED','CANCELLED')
    when 'ACCEPTED' then (new.state = 'CONFIRMED' and new.payment_mode_snapshot = 'PAY_AT_BUSINESS') or (new.state = 'AWAITING_PAYMENT' and new.payment_mode_snapshot <> 'PAY_AT_BUSINESS')
    when 'AWAITING_PAYMENT' then new.state in ('CONFIRMED','PAYMENT_EXPIRED','CANCELLED')
    when 'CONFIRMED' then new.state in ('CHECKED_IN','CANCELLED','NO_SHOW')
    when 'CHECKED_IN' then new.state = 'IN_PROGRESS'
    when 'IN_PROGRESS' then new.state = 'COMPLETED'
    else false end;
  if not allowed then raise exception 'Invalid appointment transition: % -> %',old.state,new.state; end if;
  if new.state = 'ACCEPTED' then
    select coalesce(s.approval_mode,b.booking_approval_mode,'ADMIN_APPROVAL') into approval_mode
      from public.business_settings b left join public.branch_booking_settings s on s.branch_id = new.branch_id limit 1;
    if new.acceptance_source = 'AUTO' then
      if pg_trigger_depth() < 2 or approval_mode <> 'AUTO_CONFIRM' then raise exception 'Automatic acceptance requires the booking workflow'; end if;
    elsif auth.uid() is null or new.accepted_by <> auth.uid() or not (
      private.can_admin_access_branch(new.branch_id) or
      (approval_mode = 'STAFF_APPROVAL' and private.can_staff_access_branch(new.staff_id,new.branch_id))
    ) then raise exception 'Authorized staff acceptance required'; end if;
  end if;
  if new.state = 'CONFIRMED' and old.state = 'AWAITING_PAYMENT' then
    if clock_timestamp() >= old.payment_due_at then raise exception 'Payment reservation expired'; end if;
    select coalesce(sum(amount),0) into paid from public.payments where appointment_id = new.id and state = 'SUCCEEDED' and currency = new.currency and paid_at < old.payment_due_at and exception_reason is null;
    if paid < new.required_payment_amount then raise exception 'Verified payment required'; end if;
  end if;
  if new.state = 'PAYMENT_EXPIRED' and clock_timestamp() < old.payment_due_at then raise exception 'Reservation has not expired'; end if;
  return new;
end;
$$;

create or replace function private.auto_acquire_requested_appointment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare branch_value uuid; mode_value text;
begin
  select a.branch_id into branch_value from public.appointments a where a.id = new.appointment_id;
  select coalesce(s.approval_mode,b.booking_approval_mode,'ADMIN_APPROVAL') into mode_value
    from public.business_settings b left join public.branch_booking_settings s on s.branch_id = branch_value limit 1;
  if mode_value = 'AUTO_CONFIRM' then perform private.acquire_appointment(new.appointment_id,true); end if;
  return new;
end;
$$;
revoke all on function private.auto_acquire_requested_appointment() from public, anon, authenticated, service_role;

create function private.server_public_branch_booking_submit(
  p_branch_slug text,p_service uuid,p_staff uuid,p_start timestamptz,p_request_key uuid,
  p_name text,p_email text,p_phone text,p_auth_user uuid,p_fulfillment text,
  p_address text,p_latitude numeric,p_longitude numeric,p_landmark text,p_instructions text,p_area_hint text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  b public.business_settings; br public.branches; pol public.booking_policy_versions; c public.customers;
  existing public.appointments; svc record; slot jsonb; availability jsonb;
  chosen uuid; appointment_id uuid; guest_token text; token_hash text; normalized_email text; normalized_phone text;
  local_day date; finish timestamptz; total bigint; required bigint; travel_before integer; travel_after integer;
  fee bigint; effective_mode public.payment_mode; effective_deposit_type text; deposit_amount bigint; deposit_percent integer;
begin
  if current_setting('role', true) <> 'service_role' then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_branch_slug is null or p_branch_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or p_service is null or p_start is null or p_request_key is null
    or p_fulfillment not in ('BUSINESS_LOCATION','HOME_SERVICE') then raise exception 'Invalid booking request' using errcode = '22023'; end if;
  if p_fulfillment = 'HOME_SERVICE' and (p_auth_user is null or p_address is null or length(trim(p_address)) not between 5 and 500
    or p_area_hint is null or length(trim(p_area_hint)) not between 2 and 120
    or p_latitude is null or p_latitude not between -90 and 90 or p_longitude is null or p_longitude not between -180 and 180
    or (p_landmark is not null and length(p_landmark)>200) or (p_instructions is not null and length(p_instructions)>1000)) then
    raise exception 'A valid registered Home Service destination is required' using errcode = '22023';
  end if;
  perform set_config('request.jwt.claim.sub',coalesce(p_auth_user::text,''),true);
  perform private.lock_schedule();
  select * into b from public.business_settings where singleton limit 1;
  select x.* into br from public.branches x where x.slug = p_branch_slug and private.public_booking_branch_is_eligible(x.id) limit 1;
  if b.id is null or not b.published or br.id is null then raise exception 'This branch is not accepting bookings' using errcode = '42501'; end if;
  select s.*, coalesce(bs.price_override,s.price_amount) effective_price,
    coalesce(bs.payment_mode_override,s.payment_mode) effective_payment_mode,
    coalesce(bs.deposit_type_override,s.deposit_type) effective_deposit_type,
    coalesce(bs.deposit_amount_override,s.deposit_amount) effective_deposit_amount,
    coalesce(bs.deposit_percent_bps_override,s.deposit_percent_bps) effective_deposit_percent_bps,
    coalesce(bs.home_service_fee_override,s.home_service_fee) effective_home_fee,
    coalesce(bs.home_travel_before_minutes_override,s.home_travel_before_minutes) effective_travel_before,
    coalesce(bs.home_travel_after_minutes_override,s.home_travel_after_minutes) effective_travel_after
    into svc from public.services s join public.branch_services bs on bs.service_id=s.id and bs.branch_id=br.id and bs.active
    left join public.service_categories cat on cat.id=s.category_id
    where s.id=p_service and s.active and s.published and (s.category_id is null or (cat.active and cat.published))
      and ((p_fulfillment='BUSINESS_LOCATION' and s.supports_business_location) or (p_fulfillment='HOME_SERVICE' and s.supports_home_service));
  if svc.id is null then raise exception 'Service is unavailable at this branch' using errcode = '22023'; end if;
  select * into pol from public.booking_policy_versions where branch_id=br.id and published order by version desc limit 1;
  if pol.id is null then raise exception 'Branch booking policy is unavailable' using errcode = '55000'; end if;
  select * into existing from public.appointments a where a.request_key=p_request_key;
  if found then
    if existing.branch_id<>br.id or existing.starts_at<>p_start or existing.fulfillment_mode::text<>p_fulfillment
      or (p_staff is not null and existing.staff_id<>p_staff)
      or not exists(select 1 from public.appointment_items i where i.appointment_id=existing.id and i.service_id=p_service)
      or (p_auth_user is not null and not exists(select 1 from public.customers x where x.id=existing.customer_id and x.auth_user_id=p_auth_user))
      or (p_auth_user is null and not exists(select 1 from public.customers x where x.id=existing.customer_id and x.auth_user_id is null and x.display_name=trim(coalesce(p_name,'')) and x.email=lower(trim(coalesce(p_email,'')))))
    then raise exception 'Idempotency key reused with different booking'; end if;
    return jsonb_build_object('appointment_id',existing.id,'guest_token',null,'branch_slug',br.slug);
  end if;
  if auth.uid() is null then
    if not b.guest_booking_enabled then raise exception 'Guest booking is disabled'; end if;
    if p_name is null or length(trim(p_name)) not between 2 and 200 or p_email is null or length(trim(p_email))>254
      or trim(p_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      or (p_phone is not null and trim(p_phone)<>'' and trim(p_phone) !~ '^\+?[0-9 ()-]{7,25}$') then
      raise exception 'Valid guest contact information is required'; end if;
    normalized_email:=lower(trim(p_email)); normalized_phone:=nullif(trim(p_phone),'');
  else
    if p_auth_user is distinct from auth.uid() then raise exception 'Authenticated customer mismatch' using errcode='42501'; end if;
    select * into c from public.customers where auth_user_id=auth.uid();
    if not found then raise exception 'Complete your customer profile before booking'; end if;
    select lower(u.email) into normalized_email from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null;
    if normalized_email is null then raise exception 'Verify your account email before booking'; end if;
    if p_name is not null and length(trim(p_name)) between 2 and 200 then c.display_name:=trim(p_name); end if;
    c.email:=normalized_email;
    if p_phone is not null then if trim(p_phone)<>'' and trim(p_phone) !~ '^\+?[0-9 ()-]{7,25}$' then raise exception 'Enter a valid mobile number'; end if; c.phone:=nullif(trim(p_phone),''); end if;
    update public.customers set display_name=c.display_name,email=c.email,phone=c.phone where id=c.id;
  end if;
  local_day:=(p_start at time zone br.timezone)::date;
  availability:=private.calculate_public_branch_availability(br.slug,p_service,local_day,p_staff,p_fulfillment,
    case when p_fulfillment='HOME_SERVICE' then p_latitude else null end,
    case when p_fulfillment='HOME_SERVICE' then p_longitude else null end);
  select value into slot from jsonb_array_elements(coalesce(availability->'slots','[]'::jsonb)) value
    where (value->>'starts_at')::timestamptz=p_start limit 1;
  if slot is null then raise exception 'This time is no longer available'; end if;
  chosen:=coalesce(p_staff,nullif(slot->>'assigned_staff_id','')::uuid);
  if chosen is null or not exists(select 1 from jsonb_array_elements(coalesce(slot->'staff','[]'::jsonb)) x where x->>'id'=chosen::text) then
    raise exception 'No eligible staff member is available'; end if;
  if p_fulfillment='HOME_SERVICE' and br.home_service_max_radius_km is not null and
    (br.service_origin_latitude is null or br.service_origin_longitude is null) then raise exception 'Home Service area is not configured'; end if;
  if p_auth_user is null then
    guest_token:=translate(rtrim(encode(extensions.gen_random_bytes(32),'base64'),'='),'+/','-_');
    token_hash:=encode(extensions.digest(convert_to(guest_token,'UTF8'),'sha256'),'hex');
    insert into public.customers(display_name,email,phone) values(trim(p_name),normalized_email,normalized_phone) returning * into c;
  end if;
  finish:=p_start+make_interval(mins=>svc.duration_minutes);
  fee:=case when p_fulfillment='HOME_SERVICE' then svc.effective_home_fee else 0 end;
  travel_before:=case when p_fulfillment='HOME_SERVICE' then coalesce(svc.effective_travel_before,0) else 0 end;
  travel_after:=case when p_fulfillment='HOME_SERVICE' then coalesce(svc.effective_travel_after,0) else 0 end;
  total:=svc.effective_price+fee;
  if total<0 or total>9007199254740991 then raise exception 'Appointment total is too large'; end if;
  effective_mode:=svc.effective_payment_mode;
  effective_deposit_type:=svc.effective_deposit_type;
  deposit_amount:=svc.effective_deposit_amount;
  deposit_percent:=svc.effective_deposit_percent_bps;
  required:=case effective_mode when 'PAY_AT_BUSINESS' then 0 when 'FULL_PAYMENT' then total
    when 'DEPOSIT' then case when effective_deposit_type='PERCENTAGE' then ceil(total::numeric*coalesce(deposit_percent,0)/10000)::bigint else least(total,coalesce(deposit_amount,0)) end end;
  perform set_config('app.public_booking_branch_id',br.id::text,true);
  insert into public.appointments(customer_id,staff_id,policy_version_id,request_key,starts_at,ends_at,
    buffer_before_minutes,buffer_after_minutes,occupied_range,currency,total_amount,payment_mode_snapshot,
    required_payment_amount,fulfillment_mode,home_service_fee_snapshot,home_travel_before_snapshot,
    home_travel_after_snapshot,service_area_hint,branch_id)
  values(c.id,chosen,pol.id,p_request_key,p_start,finish,svc.buffer_before_minutes,svc.buffer_after_minutes,
    tstzrange(p_start-make_interval(mins=>svc.buffer_before_minutes+travel_before),finish+make_interval(mins=>svc.buffer_after_minutes+travel_after),'[)'),
    b.currency,total,effective_mode,required,p_fulfillment::public.appointment_fulfillment_mode,fee,travel_before,travel_after,
    case when p_fulfillment='HOME_SERVICE' then trim(p_area_hint) else null end,br.id)
  returning id into appointment_id;
  insert into public.appointment_items(appointment_id,service_id,service_name_snapshot,price_amount,duration_minutes,buffer_before_minutes,buffer_after_minutes)
  values(appointment_id,svc.id,svc.name,svc.effective_price,svc.duration_minutes,svc.buffer_before_minutes,svc.buffer_after_minutes);
  if p_fulfillment='HOME_SERVICE' then
    insert into public.appointment_home_locations(appointment_id,address,latitude,longitude,landmark,instructions,area_hint)
    values(appointment_id,trim(p_address),p_latitude,p_longitude,nullif(trim(p_landmark),''),nullif(trim(p_instructions),''),trim(p_area_hint));
    insert into public.audit_logs(actor_id,action,entity_table,entity_id,branch_id,details)
    values(auth.uid(),'home_service.booking_submitted','appointments',appointment_id,br.id,jsonb_build_object('fulfillment_mode','HOME_SERVICE'));
  end if;
  if p_auth_user is null then
    insert into public.guest_access_tokens(appointment_id,token_hash,scope,expires_at)
    values(appointment_id,token_hash,'VIEW',clock_timestamp()+interval '30 days');
  end if;
  return jsonb_build_object('appointment_id',appointment_id,'guest_token',guest_token,'branch_slug',br.slug);
end;
$$;
revoke all on function private.server_public_branch_booking_submit(text,uuid,uuid,timestamptz,uuid,text,text,text,uuid,text,text,numeric,numeric,text,text,text) from public, anon, authenticated, service_role;
grant execute on function private.server_public_branch_booking_submit(text,uuid,uuid,timestamptz,uuid,text,text,text,uuid,text,text,numeric,numeric,text,text,text) to service_role;
create function public.server_public_branch_booking_submit(
  p_branch_slug text,p_service uuid,p_staff uuid,p_start timestamptz,p_request_key uuid,
  p_name text,p_email text,p_phone text,p_auth_user uuid,p_fulfillment text,
  p_address text,p_latitude numeric,p_longitude numeric,p_landmark text,p_instructions text,p_area_hint text
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.server_public_branch_booking_submit(p_branch_slug,p_service,p_staff,p_start,p_request_key,
    p_name,p_email,p_phone,p_auth_user,p_fulfillment,p_address,p_latitude,p_longitude,p_landmark,p_instructions,p_area_hint);
$$;
revoke all on function public.server_public_branch_booking_submit(text,uuid,uuid,timestamptz,uuid,text,text,text,uuid,text,text,numeric,numeric,text,text,text) from public, anon, authenticated;
grant execute on function public.server_public_branch_booking_submit(text,uuid,uuid,timestamptz,uuid,text,text,text,uuid,text,text,numeric,numeric,text,text,text) to service_role;

-- The provider integration consumes immutable appointment snapshots, so one
-- PayMongo account safely bills the branch-computed amount without accepting a
-- client supplied total. No branch-specific provider credentials are exposed.
comment on function public.server_public_branch_booking_submit(text,uuid,uuid,timestamptz,uuid,text,text,text,uuid,text,text,numeric,numeric,text,text,text)
  is 'Service-role-only branch-resolving booking entry point. Revalidates branch, service, schedule, coverage, customer and pricing; never trusts a client branch UUID or amount.';

-- Customer-owned appointment reads expose only the public location summary.
create function public.customer_appointment_branch_summaries(p_appointments uuid[])
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('appointment_id',a.id,'name',br.name,
    'address',br.address,'contact_email',br.contact_email,'contact_phone',br.contact_phone,
    'timezone',br.timezone) order by a.starts_at desc),'[]'::jsonb)
  from public.appointments a join public.branches br on br.id=a.branch_id
  where auth.uid() is not null and a.id=any(p_appointments) and private.owns_customer(a.customer_id);
$$;
revoke all on function public.customer_appointment_branch_summaries(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.customer_appointment_branch_summaries(uuid[]) to authenticated;

-- Guest access remains token-and-appointment-bound and now reports the actual
-- branch timezone and public location attached to the immutable appointment.
create or replace function private.guest_appointment_by_token(p_token_hash text,p_appointment uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',a.id,'reference',a.public_reference,'state',a.state,
    'starts_at',a.starts_at,'ends_at',a.ends_at,'currency',a.currency,'total_amount',a.total_amount,
    'payment_mode',a.payment_mode_snapshot,'required_payment_amount',a.required_payment_amount,
    'payment_due_at',a.payment_due_at,'customer_name',c.display_name,'customer_email',c.email,
    'customer_phone',c.phone,'staff_name',s.display_name,'service_name',i.service_name_snapshot,
    'duration_minutes',i.duration_minutes,'timezone',br.timezone,'branch_slug',br.slug,
    'branch_name',br.name,'branch_address',br.address)
  from public.guest_access_tokens t join public.appointments a on a.id=t.appointment_id
  join public.customers c on c.id=a.customer_id join public.staff s on s.id=a.staff_id
  join public.appointment_items i on i.appointment_id=a.id join public.branches br on br.id=a.branch_id
  where t.token_hash=p_token_hash and a.id=p_appointment and t.scope='VIEW'
    and t.consumed_at is null and t.revoked_at is null and t.expires_at>clock_timestamp()
  limit 1;
$$;
revoke all on function private.guest_appointment_by_token(text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.guest_appointment_by_token(text,uuid) to anon,authenticated;

comment on function public.customer_appointment_branch_summaries(uuid[])
  is 'Returns branch contact, timezone, and name only for appointments owned by the authenticated customer.';
