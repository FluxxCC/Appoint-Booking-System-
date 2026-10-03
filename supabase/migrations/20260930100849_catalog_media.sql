-- Public marketing assets only; uploads/listing/deletion require live admin + MFA.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('catalog-images','catalog-images',true,2097152,array['image/webp']);

create function private.catalog_image_unreferenced(p_path text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then return false; end if;
 perform private.lock_schedule();
 return not exists(select 1 from public.services where image_path=p_path) and not exists(select 1 from public.staff where photo_path=p_path);
end; $$;
revoke all on function private.catalog_image_unreferenced(text) from public,anon,authenticated;
grant execute on function private.catalog_image_unreferenced(text) to authenticated;
create policy catalog_media_admin_read on storage.objects for select to authenticated using(bucket_id='catalog-images' and (select private.is_admin()));
create policy catalog_media_admin_insert on storage.objects for insert to authenticated with check(bucket_id='catalog-images' and (select private.is_admin())
 and name ~ '^(services|staff)/[0-9a-f-]{36}/[0-9a-f-]{36}[.]webp$');
-- No UPDATE policy: object paths are immutable, and upsert is never used.
create policy catalog_media_admin_delete on storage.objects for delete to authenticated using(bucket_id='catalog-images' and private.catalog_image_unreferenced(name));

create function public.catalog_set_image(p_kind text,p_id uuid,p_path text,p_expected text) returns void language plpgsql security invoker set search_path='' as $$
declare old_path text;
begin
 if not private.is_admin() then raise exception 'Admin with MFA required' using errcode='42501'; end if;
 perform private.lock_schedule();
 if p_kind='services' then select image_path into old_path from public.services where id=p_id;
 elsif p_kind='staff' then select photo_path into old_path from public.staff where id=p_id;
 else raise exception 'Invalid image target'; end if;
 if not found then raise exception 'Image target not found'; end if;
 if old_path is distinct from p_expected then raise exception 'Image changed; reload before retrying' using errcode='40001'; end if;
 if p_path is not null and (p_path !~ ('^'||p_kind||'/'||p_id::text||'/[0-9a-f-]{36}[.]webp$') or not exists(select 1 from storage.objects where bucket_id='catalog-images' and name=p_path)) then raise exception 'Invalid image object'; end if;
 if p_kind='services' then update public.services set image_path=p_path where id=p_id;
 else update public.staff set photo_path=p_path where id=p_id; end if;
end; $$;
revoke all on function public.catalog_set_image(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.catalog_set_image(text,uuid,text,text) to authenticated;
