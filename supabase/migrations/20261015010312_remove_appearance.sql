-- Remove the public website customization feature and its persisted settings.
-- Keep public business/catalog projections backed by business and branch data.

drop policy if exists appearance_media_admin_insert on storage.objects;

create or replace function private.catalog_image_unreferenced(p_path text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then return false; end if;
  perform private.lock_schedule();
  return not exists(select 1 from public.services where image_path=p_path)
    and not exists(select 1 from public.staff where photo_path=p_path);
end;
$$;
create or replace function private.public_website_data() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'business', case when b.published and public.is_public_branch(br.id) then
      jsonb_build_object('name', b.name, 'description', b.description, 'timezone', b.timezone,
        'currency', b.currency, 'contact_email', b.contact_email, 'contact_phone', b.contact_phone,
        'address', b.address, 'guest_booking_enabled', b.guest_booking_enabled,
        'customer_registration_enabled', b.customer_registration_enabled) else null end,
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

create or replace function private.public_booking_data(p_branch_slug text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  b public.business_settings;
  selected public.branches;
  branch_count integer;
  branches_json jsonb;
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
create or replace function private.broadcast_app_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform realtime.send('{}'::jsonb, 'refresh', 'app:changes', true);
  exception when others then
    raise warning 'Realtime application invalidation failed for %.%', tg_table_schema, tg_table_name;
  end;
  if tg_table_schema = 'public' and tg_table_name = any (array[
    'business_settings', 'booking_policy_versions', 'service_categories', 'services', 'staff', 'staff_services',
    'business_hours', 'staff_working_hours', 'staff_schedule_exceptions', 'business_closures', 'appointments',
    'appointment_items', 'announcements'
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

drop table if exists public.website_settings;