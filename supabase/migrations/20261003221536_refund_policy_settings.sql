-- Store the owner-editable refund policy with the singleton business settings.
alter table public.business_settings
  add column refund_policy text not null default 'Refund requests are reviewed individually by the business based on the booking details. Cancelling an appointment does not automatically issue a refund. To request a refund, contact the business promptly and include your booking reference. Approved refunds are returned to the original payment method when supported by the payment provider. Processing times are determined by the payment provider and financial institution. The business will confirm its decision directly.'
  check (length(trim(refund_policy)) between 1 and 10000);

create or replace function public.admin_save_settings(p_values jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare
 b public.business_settings;
 pol public.booking_policy_versions;
 fallback_refund_policy constant text := 'Refund requests are reviewed individually by the business based on the booking details. Cancelling an appointment does not automatically issue a refund. To request a refund, contact the business promptly and include your booking reference. Approved refunds are returned to the original payment method when supported by the payment provider. Processing times are determined by the payment provider and financial institution. The business will confirm its decision directly.';
begin
 if not private.is_admin() then raise exception 'Admin with MFA required' using errcode='42501'; end if;
 perform private.lock_schedule();
 select * into b from public.business_settings;
 if nullif(p_values->>'expected_updated_at','')::timestamptz is distinct from b.updated_at
 then raise exception 'Settings changed; reload before saving' using errcode='40001'; end if;
 if length(trim(p_values->>'name')) not between 1 and 200
 or length(coalesce(p_values->>'contact_email',''))>254
 or length(coalesce(p_values->>'contact_phone',''))>40
 or length(coalesce(p_values->>'address',''))>1000
 or length(trim(p_values->>'terms')) not between 1 and 10000
 or (p_values ? 'refund_policy' and length(trim(p_values->>'refund_policy')) not between 1 and 10000)
 then raise exception 'Invalid business details' using errcode='22023'; end if;
 insert into public.business_settings(name,description,contact_email,contact_phone,address,timezone,currency,
 scheduling_interval_minutes,default_buffer_minutes,guest_booking_enabled,customer_registration_enabled,require_staff_approval,refund_policy)
 values(trim(p_values->>'name'),p_values->>'description',nullif(p_values->>'contact_email',''),nullif(p_values->>'contact_phone',''),nullif(p_values->>'address',''),
 p_values->>'timezone',p_values->>'currency',(p_values->>'scheduling_interval_minutes')::int,(p_values->>'default_buffer_minutes')::int,
 (p_values->>'guest_booking_enabled')::boolean,(p_values->>'customer_registration_enabled')::boolean,(p_values->>'require_staff_approval')::boolean,coalesce(nullif(trim(p_values->>'refund_policy'),''),b.refund_policy,fallback_refund_policy))
 on conflict(singleton) do update set name=excluded.name,description=excluded.description,contact_email=excluded.contact_email,
 contact_phone=excluded.contact_phone,address=excluded.address,timezone=excluded.timezone,currency=excluded.currency,
 scheduling_interval_minutes=excluded.scheduling_interval_minutes,default_buffer_minutes=excluded.default_buffer_minutes,
 guest_booking_enabled=excluded.guest_booking_enabled,customer_registration_enabled=excluded.customer_registration_enabled,
 require_staff_approval=excluded.require_staff_approval,refund_policy=excluded.refund_policy;
 select * into pol from public.booking_policy_versions where published order by version desc limit 1;
 if pol.id is null or (pol.payment_window_minutes,pol.minimum_notice_minutes,pol.maximum_advance_days,pol.terms)
 is distinct from ((p_values->>'payment_window_minutes')::int,(p_values->>'minimum_notice_minutes')::int,(p_values->>'maximum_advance_days')::int,p_values->>'terms') then
 insert into public.booking_policy_versions(version,payment_window_minutes,minimum_notice_minutes,maximum_advance_days,cancellation_notice_minutes,no_show_grace_minutes,terms,published)
 values((select coalesce(max(version),0)+1 from public.booking_policy_versions),(p_values->>'payment_window_minutes')::int,
 (p_values->>'minimum_notice_minutes')::int,(p_values->>'maximum_advance_days')::int,coalesce(pol.cancellation_notice_minutes,1440),
 coalesce(pol.no_show_grace_minutes,15),p_values->>'terms',true);
 end if;
end; $$;

create or replace function private.public_website_data() returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object(
  'business', case when b.published then jsonb_build_object('name',b.name,'description',b.description,'timezone',b.timezone,'currency',b.currency,'contact_email',b.contact_email,'contact_phone',b.contact_phone,'address',b.address,'guest_booking_enabled',b.guest_booking_enabled,'customer_registration_enabled',b.customer_registration_enabled,'booking_approval_mode',b.booking_approval_mode) else null end,
  'website', (select jsonb_build_object('logo_path',w.logo_path,'hero_image_path',w.hero_image_path,'primary_color',w.primary_color,'font_key',w.font_key,'sections',w.sections) from public.website_settings w where w.published),
  'services', case when b.published then (select public.public_catalog()->'services') else '[]'::jsonb end,
  'categories', case when b.published then coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'slug',c.slug,'sort_order',c.sort_order) order by c.sort_order,c.name) from public.service_categories c where c.active and c.published),'[]'::jsonb) else '[]'::jsonb end,
  'staff', case when b.published then (select public.public_catalog()->'staff') else '[]'::jsonb end,
  'assignments', case when b.published then (select public.public_catalog()->'assignments') else '[]'::jsonb end,
  'hours', case when b.published then coalesce((select jsonb_agg(jsonb_build_object('weekday',h.weekday,'opens_at',h.opens_at,'closes_at',h.closes_at) order by h.weekday,h.opens_at) from public.business_hours h),'[]'::jsonb) else '[]'::jsonb end,
  'announcements', case when b.published then coalesce((select jsonb_agg(jsonb_build_object('title',a.title,'body',a.body,'starts_at',a.starts_at,'ends_at',a.ends_at) order by a.starts_at desc) from public.announcements a where a.published and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now())),'[]'::jsonb) else '[]'::jsonb end,
  'policy', (select jsonb_build_object('terms',p.terms,'minimum_notice_minutes',p.minimum_notice_minutes,'maximum_advance_days',p.maximum_advance_days,'cancellation_notice_minutes',p.cancellation_notice_minutes) from public.booking_policy_versions p where p.published order by p.version desc limit 1),
  'refund_policy', case when b.published then b.refund_policy else null end
 ) from public.business_settings b limit 1;
$$;
