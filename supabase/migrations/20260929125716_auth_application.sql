-- Additive Phase 3 account helpers. Booking schema/lifecycle are unchanged.
create function private.get_access_context() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 return jsonb_build_object(
   'profileActive', private.is_active_user(),
   'roles', coalesce((select jsonb_agg(role order by role) from public.user_roles where auth_user_id=auth.uid()),'[]'::jsonb),
   'staffActive', exists(select 1 from public.staff s where s.auth_user_id=auth.uid() and private.is_assigned_staff(s.id))
 );
end; $$;

create function private.complete_customer_profile(p_name text,p_phone text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid; verified_email text;
begin
 if auth.uid() is null or not private.is_active_user() then raise exception 'Active account required'; end if;
 if p_name is null or length(trim(p_name)) not between 2 and 200 then raise exception 'Enter a full name'; end if;
 if p_phone is not null and p_phone !~ '^[+]?[0-9 ()-]{7,25}$' then raise exception 'Invalid mobile number'; end if;
 select email into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if verified_email is null then raise exception 'Verify your email first'; end if;
 -- Link by authenticated UUID only. NEVER claim existing guests by matching email.
 insert into public.customers(auth_user_id,display_name,email,phone)
 values(auth.uid(),trim(p_name),verified_email,nullif(trim(p_phone),''))
 on conflict (auth_user_id) do update set display_name=excluded.display_name,email=excluded.email,phone=excluded.phone
 returning id into result;
 update public.profiles set display_name=trim(p_name) where auth_user_id=auth.uid();
 return result;
end; $$;

create function private.link_staff_account(p_user uuid,p_name text,p_slug text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
 if auth.uid() is null or not private.is_owner() then raise exception 'Owner with MFA required'; end if;
 if p_name is null or length(trim(p_name)) not between 2 and 200 or p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug)>100 then raise exception 'Invalid staff details'; end if;
 perform private.lock_schedule();
 if not exists(select 1 from auth.users where id=p_user) or not exists(select 1 from public.profiles where auth_user_id=p_user and disabled_at is null)
 then raise exception 'Active Auth account required'; end if;
 if exists(select 1 from public.user_roles where auth_user_id=p_user and role in ('OWNER','ADMIN')) then raise exception 'Use a dedicated staff account'; end if;
 select id into result from public.staff where auth_user_id=p_user;
 if result is not null then
   if not exists(select 1 from public.staff where id=result and active and slug=p_slug) then raise exception 'Existing staff record requires review'; end if;
 else
   insert into public.staff(auth_user_id,display_name,slug,active,published,bookable)
   values(p_user,trim(p_name),p_slug,true,false,false) returning id into result;
 end if;
 insert into public.user_roles(auth_user_id,role) values(p_user,'STAFF') on conflict(auth_user_id,role) do nothing;
 update public.profiles set display_name=trim(p_name) where auth_user_id=p_user;
 return result;
end; $$;

create function public.get_access_context() returns jsonb language sql security invoker set search_path = ''
as $$ select private.get_access_context(); $$;
create function public.complete_customer_profile(p_name text,p_phone text default null) returns uuid language sql security invoker set search_path = ''
as $$ select private.complete_customer_profile(p_name,p_phone); $$;
create function public.link_staff_account(p_user uuid,p_name text,p_slug text) returns uuid language sql security invoker set search_path = ''
as $$ select private.link_staff_account(p_user,p_name,p_slug); $$;

revoke all on function private.get_access_context(),private.complete_customer_profile(text,text),private.link_staff_account(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.get_access_context(),public.complete_customer_profile(text,text),public.link_staff_account(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function private.get_access_context(),private.complete_customer_profile(text,text),private.link_staff_account(uuid,text,text) to authenticated;
grant execute on function public.get_access_context(),public.complete_customer_profile(text,text),public.link_staff_account(uuid,text,text) to authenticated;

-- Initial OWNER bootstrap is a service-only, one-time operation under the same
-- role lock. No password or public signup endpoint participates in this operation.
create function private.bootstrap_initial_owner(p_user uuid,p_email text) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if current_setting('role',true) <> 'service_role' or auth.uid() is not null then raise exception 'Trusted backend only'; end if;
 perform private.lock_schedule();
 if exists(select 1 from public.user_roles where role='OWNER') then raise exception 'An owner already exists; use the existing owner process'; end if;
 if not exists(select 1 from auth.users u join public.profiles p on p.auth_user_id=u.id
 where u.id=p_user and lower(u.email)=lower(trim(p_email)) and u.email_confirmed_at is not null and p.disabled_at is null)
 then raise exception 'Verify the active account UUID and confirmed email'; end if;
 insert into public.user_roles(auth_user_id,role) values(p_user,'OWNER');
end; $$;
create function public.bootstrap_initial_owner(p_user uuid,p_email text) returns void
language sql security invoker set search_path = '' as $$ select private.bootstrap_initial_owner(p_user,p_email); $$;
revoke all on function private.bootstrap_initial_owner(uuid,text),public.bootstrap_initial_owner(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.bootstrap_initial_owner(uuid,text),public.bootstrap_initial_owner(uuid,text) to service_role;
