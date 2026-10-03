-- Phase 8.5: human reference and one-time email exchange for guest access.
alter table public.appointments add column public_reference text not null
  default upper('BK-' || substr(replace(gen_random_uuid()::text,'-',''),1,16));
alter table public.appointments add constraint appointments_public_reference_unique unique(public_reference);
alter table public.appointments add constraint appointments_public_reference_format
  check(public_reference ~ '^BK-[A-F0-9]{16}$');

-- MANAGE is an existing token scope. Here it is a short-lived, single-use
-- email exchange credential; only the resulting VIEW token is placed in a cookie.
create function private.issue_guest_access_link(p_email text,p_reference text default null,p_appointment uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare booking uuid; raw_token text; hashed text;
begin
 if p_reference is null and p_appointment is null then return null; end if;
 select a.id into booking from public.appointments a
 join public.customers c on c.id=a.customer_id
 where c.auth_user_id is null and c.email=lower(trim(p_email))
   and (p_reference is null or a.public_reference=upper(trim(p_reference)))
   and (p_appointment is null or a.id=p_appointment)
 limit 1;
 if booking is null then return null; end if;
 raw_token := translate(rtrim(encode(extensions.gen_random_bytes(32),'base64'),'='),'+/','-_');
 hashed := encode(extensions.digest(convert_to(raw_token,'UTF8'),'sha256'),'hex');
 insert into public.guest_access_tokens(appointment_id,token_hash,scope,expires_at)
 values(booking,hashed,'MANAGE',clock_timestamp()+interval '15 minutes');
 return jsonb_build_object('appointment_id',booking,'token',raw_token);
end; $$;
revoke all on function private.issue_guest_access_link(text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.issue_guest_access_link(text,text,uuid) to service_role;
create function public.issue_guest_access_link(p_email text,p_reference text default null,p_appointment uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
 select private.issue_guest_access_link(p_email,p_reference,p_appointment); $$;
revoke all on function public.issue_guest_access_link(text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.issue_guest_access_link(text,text,uuid) to service_role;

create function private.exchange_guest_access_link(p_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare token_row public.guest_access_tokens; raw_token text; hashed text;
begin
 if p_token_hash !~ '^[a-f0-9]{64}$' then return null; end if;
 select * into token_row from public.guest_access_tokens
 where token_hash=p_token_hash and scope='MANAGE' and consumed_at is null
   and revoked_at is null and expires_at>clock_timestamp() for update;
 if not found then return null; end if;
 update public.guest_access_tokens set consumed_at=clock_timestamp() where id=token_row.id;
 raw_token := translate(rtrim(encode(extensions.gen_random_bytes(32),'base64'),'='),'+/','-_');
 hashed := encode(extensions.digest(convert_to(raw_token,'UTF8'),'sha256'),'hex');
 insert into public.guest_access_tokens(appointment_id,token_hash,scope,expires_at)
 values(token_row.appointment_id,hashed,'VIEW',clock_timestamp()+interval '30 days');
 return jsonb_build_object('appointment_id',token_row.appointment_id,'guest_token',raw_token);
end; $$;
revoke all on function private.exchange_guest_access_link(text) from public,anon,authenticated,service_role;
grant execute on function private.exchange_guest_access_link(text) to service_role;
create function public.exchange_guest_access_link(p_token_hash text)
returns jsonb language sql security invoker set search_path='' as $$
 select private.exchange_guest_access_link(p_token_hash); $$;
revoke all on function public.exchange_guest_access_link(text) from public,anon,authenticated,service_role;
grant execute on function public.exchange_guest_access_link(text) to service_role;

create or replace function private.guest_appointment_by_token(p_token_hash text,p_appointment uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
   'id',a.id,'reference',a.public_reference,'state',a.state,
   'starts_at',a.starts_at,'ends_at',a.ends_at,'currency',a.currency,
   'total_amount',a.total_amount,'payment_mode',a.payment_mode_snapshot,
   'required_payment_amount',a.required_payment_amount,'payment_due_at',a.payment_due_at,
   'customer_name',c.display_name,'customer_email',c.email,'customer_phone',c.phone,
   'staff_name',s.display_name,'service_name',i.service_name_snapshot,
   'duration_minutes',i.duration_minutes,'timezone',b.timezone
 ) from public.guest_access_tokens t
 join public.appointments a on a.id=t.appointment_id
 join public.customers c on c.id=a.customer_id
 join public.staff s on s.id=a.staff_id
 join public.appointment_items i on i.appointment_id=a.id
 cross join public.business_settings b
 where t.token_hash=p_token_hash and a.id=p_appointment and t.scope='VIEW'
   and t.consumed_at is null and t.revoked_at is null and t.expires_at>clock_timestamp()
 limit 1;
$$;
