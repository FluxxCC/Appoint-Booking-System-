-- Allow owner/admin appearance uploads in the existing public marketing bucket.
create policy appearance_media_admin_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'catalog-images'
  and (select private.is_admin())
  and name ~ '^appearance/(logo|hero)/[0-9a-f-]{36}[.]webp$'
);

-- Prevent cleanup from deleting a logo or hero image still referenced by the website.
create or replace function private.catalog_image_unreferenced(p_path text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then return false; end if;
  perform private.lock_schedule();
  return not exists(select 1 from public.services where image_path=p_path)
    and not exists(select 1 from public.staff where photo_path=p_path)
    and not exists(select 1 from public.website_settings where logo_path=p_path or hero_image_path=p_path);
end;
$$;
