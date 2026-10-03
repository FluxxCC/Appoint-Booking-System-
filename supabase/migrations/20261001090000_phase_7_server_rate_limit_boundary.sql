-- Phase 7 server boundary: clients must use rate-limited Next.js endpoints.
-- The app's server-only Supabase secret key is required for these RPCs.

revoke execute on function public.availability_for_date(uuid,date,uuid) from anon, authenticated;
grant execute on function public.availability_for_date(uuid,date,uuid) to service_role;
revoke execute on function private.calculate_availability(uuid,date,uuid,boolean) from anon;
grant execute on function private.calculate_availability(uuid,date,uuid,boolean) to service_role;

revoke execute on function public.public_booking_submit(uuid,uuid,timestamptz,uuid,text,text,text) from anon, authenticated;
revoke execute on function private.public_booking_submit(uuid,uuid,timestamptz,uuid,text,text,text) from anon, authenticated;
grant execute on function public.public_booking_submit(uuid,uuid,timestamptz,uuid,text,text,text) to service_role;
grant execute on function private.public_booking_submit(uuid,uuid,timestamptz,uuid,text,text,text) to service_role;

create function private.server_availability_for_date(
  p_service uuid, p_date date, p_staff uuid, p_auth_user uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role', true) <> 'service_role' then raise exception 'Not authorized' using errcode = '42501'; end if;
  perform set_config('request.jwt.claim.sub', coalesce(p_auth_user::text, ''), true);
  return private.calculate_availability(p_service, p_date, p_staff, false);
end;
$$;
revoke all on function private.server_availability_for_date(uuid,date,uuid,uuid) from public, anon, authenticated;
grant execute on function private.server_availability_for_date(uuid,date,uuid,uuid) to service_role;
create function public.server_availability_for_date(p_service uuid,p_date date,p_staff uuid,p_auth_user uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.server_availability_for_date(p_service,p_date,p_staff,p_auth_user);
$$;
revoke all on function public.server_availability_for_date(uuid,date,uuid,uuid) from public, anon, authenticated;
grant execute on function public.server_availability_for_date(uuid,date,uuid,uuid) to service_role;

create function private.server_public_booking_submit(
  p_service uuid, p_staff uuid, p_start timestamptz, p_request_key uuid,
  p_name text, p_email text, p_phone text, p_auth_user uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role', true) <> 'service_role' then raise exception 'Not authorized' using errcode = '42501'; end if;
  perform set_config('request.jwt.claim.sub', coalesce(p_auth_user::text, ''), true);
  return private.public_booking_submit(p_service,p_staff,p_start,p_request_key,p_name,p_email,p_phone);
end;
$$;
revoke all on function private.server_public_booking_submit(uuid,uuid,timestamptz,uuid,text,text,text,uuid) from public, anon, authenticated;
grant execute on function private.server_public_booking_submit(uuid,uuid,timestamptz,uuid,text,text,text,uuid) to service_role;
create function public.server_public_booking_submit(
  p_service uuid, p_staff uuid, p_start timestamptz, p_request_key uuid,
  p_name text, p_email text, p_phone text, p_auth_user uuid
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.server_public_booking_submit(p_service,p_staff,p_start,p_request_key,p_name,p_email,p_phone,p_auth_user);
$$;
revoke all on function public.server_public_booking_submit(uuid,uuid,timestamptz,uuid,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.server_public_booking_submit(uuid,uuid,timestamptz,uuid,text,text,text,uuid) to service_role;
