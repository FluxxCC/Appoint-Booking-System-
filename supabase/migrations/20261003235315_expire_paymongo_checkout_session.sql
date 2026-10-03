-- A PayMongo checkout session can expire before the appointment's payment
-- deadline. Record that terminal provider result so a fresh attempt can be
-- created while the reservation is still payable.
create function private.expire_paymongo_checkout_attempt(p_payment uuid, p_reference text)
returns public.payment_state
language plpgsql security definer set search_path = '' as $$
declare attempt_state public.payment_state;
begin
  if current_setting('role', true) <> 'service_role' then
    raise exception 'Backend only' using errcode = '42501';
  end if;
  if p_payment is null or p_reference is null
     or p_reference !~ '^cs_[A-Za-z0-9_-]{3,190}$' then
    raise exception 'Invalid PayMongo checkout reference' using errcode = '22023';
  end if;

  update public.payments
     set state = 'CANCELLED'
   where id = p_payment
     and provider = 'paymongo'
     and provider_reference = p_reference
     and state = 'PENDING'
  returning state into attempt_state;

  if found then return attempt_state; end if;

  -- A paid webhook may have won the race against the status lookup. Return its
  -- state so the caller can report the authoritative result instead.
  select state into attempt_state
    from public.payments
   where id = p_payment
     and provider = 'paymongo'
     and provider_reference = p_reference;
  if not found then raise exception 'Payment attempt unavailable'; end if;
  return attempt_state;
end; $$;

revoke all on function private.expire_paymongo_checkout_attempt(uuid, text) from public, anon, authenticated, service_role;
grant execute on function private.expire_paymongo_checkout_attempt(uuid, text) to service_role;

create function public.expire_paymongo_checkout_attempt(p_payment uuid, p_reference text)
returns public.payment_state
language sql security invoker set search_path = '' as $$
  select private.expire_paymongo_checkout_attempt(p_payment, p_reference);
$$;
revoke all on function public.expire_paymongo_checkout_attempt(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.expire_paymongo_checkout_attempt(uuid, text) to service_role;
