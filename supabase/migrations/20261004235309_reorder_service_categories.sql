-- Save category drag order as one authorized database transaction.
create function public.catalog_reorder_categories(p_category_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_category_count integer;
  v_distinct_input_count integer;
begin
  if not private.is_admin() then
    raise exception 'Admin with MFA required' using errcode = '42501';
  end if;

  if p_category_ids is null or cardinality(p_category_ids) > 500 then
    raise exception 'Invalid category order';
  end if;

  select count(distinct requested.id)::integer
  into v_distinct_input_count
  from unnest(p_category_ids) as requested(id);

  if cardinality(p_category_ids) <> v_distinct_input_count then
    raise exception 'Category order must contain unique category IDs';
  end if;

  -- Serialize concurrent reorder requests before validating the full list.
  perform category.id
  from public.service_categories as category
  order by category.id
  for update;

  select count(*)::integer
  into v_category_count
  from public.service_categories;

  if cardinality(p_category_ids) <> v_category_count
    or exists (
      select 1
      from public.service_categories as category
      where category.id <> all(p_category_ids)
    ) then
    raise exception 'Category list changed. Reload and try again';
  end if;

  update public.service_categories as category
  set sort_order = (requested.position - 1)::integer
  from unnest(p_category_ids) with ordinality as requested(id, position)
  where category.id = requested.id;
end;
$$;

revoke all on function public.catalog_reorder_categories(uuid[])
  from public, anon, authenticated;
grant execute on function public.catalog_reorder_categories(uuid[])
  to authenticated;
