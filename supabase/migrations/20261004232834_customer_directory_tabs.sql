-- Split account customers from guest booking contacts in the authorized directory.
-- This is a read-only projection; it does not merge or modify customer records.
create or replace function public.admin_customer_directory(
  p_kind text,
  p_query text default '',
  p_page integer default 1
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  rows_json jsonb;
  total_rows bigint;
begin
  if not private.is_admin() then
    raise exception 'Admin with MFA required' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('accounts', 'guests')
     or p_query is null or length(p_query) > 100
     or p_page is null or p_page not between 1 and 10000 then
    raise exception 'Invalid customer directory filters';
  end if;

  with matched as (
    select c.id, c.display_name, c.email, c.phone
    from public.customers c
    where ((p_kind = 'accounts' and c.auth_user_id is not null)
        or (p_kind = 'guests' and c.auth_user_id is null))
      and (p_query = '' or position(lower(p_query) in lower(
        concat_ws(' ', c.display_name, c.email, c.phone)
      )) > 0)
  ), paged as (
    select c.*,
      (select count(*) from public.appointments a where a.customer_id = c.id) as appointment_count,
      (select max(a.starts_at) from public.appointments a where a.customer_id = c.id and a.starts_at < now()) as last_appointment,
      (select min(a.starts_at) from public.appointments a where a.customer_id = c.id
        and a.starts_at >= now() and a.state in ('CONFIRMED', 'AWAITING_PAYMENT')) as next_appointment
    from matched c
    order by lower(c.display_name), c.id
    limit 25 offset (p_page - 1) * 25
  )
  select coalesce(jsonb_agg(to_jsonb(paged) order by lower(paged.display_name), paged.id), '[]'::jsonb),
         (select count(*) from matched)
    into rows_json, total_rows
    from paged;

  return jsonb_build_object(
    'customers', rows_json,
    'total', total_rows,
    'page', p_page,
    'timezone', coalesce((select b.timezone from public.business_settings b limit 1), 'UTC')
  );
end;
$$;

revoke all on function public.admin_customer_directory(text, text, integer) from public, anon, authenticated;
grant execute on function public.admin_customer_directory(text, text, integer) to authenticated;
