-- Durable, provider-neutral payment-attempt preparation. No provider is selected
-- here; callers must be trusted server code using the service-role boundary.
alter table public.payments alter column provider_reference drop not null;
alter table public.payments add column checkout_url text;
alter table public.payments add constraint payments_checkout_url_https
  check (checkout_url is null or (length(checkout_url) <= 2048 and checkout_url ~ '^https://'));

create or replace function private.guard_payment() returns trigger
language plpgsql set search_path = '' as $$
declare a public.appointments; collected bigint;
begin
 select * into a from public.appointments where id=new.appointment_id for update;
 if tg_op='INSERT' then
   if a.accepted_at is null or a.state not in ('AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW')
   then raise exception 'Payment requires staff acceptance'; end if;
   if a.state='AWAITING_PAYMENT' and a.payment_due_at <= clock_timestamp() then raise exception 'Payment deadline passed'; end if;
   if new.state <> 'PENDING' then raise exception 'Payment attempts must start pending'; end if;
   if new.currency <> a.currency or new.amount > a.total_amount then raise exception 'Invalid payment amount or currency'; end if;
   select coalesce(sum(amount),0) into collected from public.payments where appointment_id=a.id and state='SUCCEEDED' and exception_reason is null;
   if collected + new.amount > a.total_amount then raise exception 'Payment exceeds outstanding amount'; end if;
   if a.state='AWAITING_PAYMENT' and new.amount <> a.required_payment_amount-collected then raise exception 'Payment must match the required deposit or full amount'; end if;
 else
   if (new.appointment_id,new.provider,new.idempotency_key,new.amount,new.currency)
      is distinct from (old.appointment_id,old.provider,old.idempotency_key,old.amount,old.currency)
   then raise exception 'Payment identity and amount are immutable'; end if;
   if (new.provider_reference,new.checkout_url) is distinct from (old.provider_reference,old.checkout_url)
      and not (old.state='PENDING' and old.provider_reference is null and old.checkout_url is null
        and new.provider_reference is not null and new.checkout_url is not null)
   then raise exception 'Provider checkout can only be attached once'; end if;
   if old.state='SUCCEEDED' and new is distinct from old then raise exception 'Successful payments are immutable'; end if;
 end if;
 return new;
end; $$;

create or replace function private.prepare_payment_attempt(
 p_appointment uuid,p_auth_user uuid,p_guest_token_hash text,p_provider text,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare booking_row public.appointments; existing public.payments; collected bigint; required bigint;
begin
 if current_setting('role',true) <> 'service_role' then raise exception 'Backend only'; end if;
 if p_appointment is null or p_idempotency_key is null or p_provider !~ '^[a-z0-9_-]{1,40}$'
   or ((p_auth_user is null) = (p_guest_token_hash is null)) then raise exception 'Invalid payment preparation request'; end if;
 if p_auth_user is not null then
   if not exists(select 1 from public.appointments a join public.customers c on c.id=a.customer_id
     join public.profiles pr on pr.auth_user_id=c.auth_user_id
     where a.id=p_appointment and c.auth_user_id=p_auth_user and pr.disabled_at is null)
   then raise exception 'Not authorized'; end if;
 else
   if p_guest_token_hash !~ '^[a-f0-9]{64}$' or not exists(
     select 1 from public.guest_access_tokens t join public.appointments a on a.id=t.appointment_id
     join public.customers c on c.id=a.customer_id
     where t.token_hash=p_guest_token_hash and t.appointment_id=p_appointment and t.scope='VIEW'
       and t.consumed_at is null and t.revoked_at is null and t.expires_at>clock_timestamp()
       and c.auth_user_id is null)
   then raise exception 'Not authorized'; end if;
 end if;
 perform private.lock_schedule();
 select * into booking_row from public.appointments where id=p_appointment for update;
 if not found then raise exception 'Appointment unavailable'; end if;
 if booking_row.state <> 'AWAITING_PAYMENT' or booking_row.payment_mode_snapshot='PAY_AT_BUSINESS'
   or booking_row.accepted_at is null or booking_row.payment_due_at is null or booking_row.payment_due_at<=clock_timestamp()
   or booking_row.required_payment_amount<=0 or booking_row.currency !~ '^[A-Z]{3}$'
 then raise exception 'Appointment is not payable'; end if;
 select coalesce(sum(amount),0) into collected from public.payments
   where appointment_id=booking_row.id and state='SUCCEEDED' and exception_reason is null and currency=booking_row.currency;
 required := booking_row.required_payment_amount-collected;
 if required<=0 then raise exception 'Appointment payment is already satisfied'; end if;
 select * into existing from public.payments where appointment_id=booking_row.id and state='PENDING' for update;
 if found then
   if existing.provider<>p_provider then raise exception 'Active payment attempt uses a different provider'; end if;
   return jsonb_build_object('payment_id',existing.id,'appointment_id',existing.appointment_id,
     'amount_minor',existing.amount,'currency',existing.currency,'idempotency_key',existing.idempotency_key,
     'provider_reference',existing.provider_reference,'checkout_url',existing.checkout_url,
     'payment_due_at',booking_row.payment_due_at,'reused',true);
 end if;
 insert into public.payments(appointment_id,provider,provider_reference,idempotency_key,amount,currency)
 values(booking_row.id,p_provider,null,p_idempotency_key,required,booking_row.currency) returning * into existing;
 return jsonb_build_object('payment_id',existing.id,'appointment_id',existing.appointment_id,
   'amount_minor',existing.amount,'currency',existing.currency,'idempotency_key',existing.idempotency_key,
   'provider_reference',existing.provider_reference,'checkout_url',existing.checkout_url,
   'payment_due_at',booking_row.payment_due_at,'reused',false);
end; $$;

create or replace function public.prepare_payment_attempt(
 p_appointment uuid,p_auth_user uuid,p_guest_token_hash text,p_provider text,p_idempotency_key uuid
) returns jsonb language sql security invoker set search_path = '' as $$
 select private.prepare_payment_attempt(p_appointment,p_auth_user,p_guest_token_hash,p_provider,p_idempotency_key);
$$;
revoke all on function private.prepare_payment_attempt(uuid,uuid,text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.prepare_payment_attempt(uuid,uuid,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.prepare_payment_attempt(uuid,uuid,text,text,uuid) to service_role;
grant execute on function public.prepare_payment_attempt(uuid,uuid,text,text,uuid) to service_role;

create or replace function private.attach_payment_checkout(p_payment uuid,p_reference text,p_checkout_url text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.payments;
begin
 if current_setting('role',true) <> 'service_role' then raise exception 'Backend only'; end if;
 if p_reference is null or length(p_reference) not between 1 and 200 or p_checkout_url !~ '^https://'
 then raise exception 'Invalid provider checkout details'; end if;
 select * into p from public.payments where id=p_payment for update;
 if not found or p.state<>'PENDING' then raise exception 'Payment attempt is unavailable'; end if;
 if p.provider_reference is not null then
   if p.provider_reference=p_reference and p.checkout_url=p_checkout_url then
     return jsonb_build_object('payment_id',p.id,'provider_reference',p.provider_reference,'checkout_url',p.checkout_url,'reused',true);
   end if;
   raise exception 'Provider checkout is already attached';
 end if;
 update public.payments set provider_reference=p_reference,checkout_url=p_checkout_url where id=p.id returning * into p;
 return jsonb_build_object('payment_id',p.id,'provider_reference',p.provider_reference,'checkout_url',p.checkout_url,'reused',false);
end; $$;
create or replace function public.attach_payment_checkout(p_payment uuid,p_reference text,p_checkout_url text)
returns jsonb language sql security invoker set search_path = '' as $$
 select private.attach_payment_checkout(p_payment,p_reference,p_checkout_url);
$$;
revoke all on function private.attach_payment_checkout(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.attach_payment_checkout(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function private.attach_payment_checkout(uuid,text,text) to service_role;
grant execute on function public.attach_payment_checkout(uuid,text,text) to service_role;
