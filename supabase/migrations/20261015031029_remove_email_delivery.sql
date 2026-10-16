-- Stop recording application email jobs while preserving appointment events and audits.
create or replace function private.log_appointment_transition() returns trigger
language plpgsql security definer set search_path = '' as $$
declare previous public.appointment_state; event_id uuid; event_actor uuid;
begin
 if tg_op = 'UPDATE' then
   if old.state = new.state then return new; end if;
   previous := old.state;
 end if;
 event_actor := case when new.state in ('ACCEPTED','AWAITING_PAYMENT','CONFIRMED')
   and new.acceptance_source = 'AUTO' then null
   when new.state = 'PAYMENT_EXPIRED' then null
   else auth.uid() end;
 insert into public.appointment_events(appointment_id,from_state,to_state,actor_id,reason)
 values(new.id,previous,new.state,event_actor,
   case when new.state = 'DECLINED' then new.decline_reason
        when new.state = 'CANCELLED' then new.cancellation_reason end)
 returning id into event_id;
 if tg_op = 'UPDATE' and new.state in ('ACCEPTED','DECLINED','PAYMENT_EXPIRED','CONFIRMED','AWAITING_PAYMENT') then
   insert into public.audit_logs(actor_id,action,entity_table,entity_id,details)
   values(event_actor,case new.state
     when 'ACCEPTED' then 'BOOKING_ACCEPTED'
     when 'DECLINED' then 'BOOKING_DECLINED'
     when 'PAYMENT_EXPIRED' then 'PAYMENT_EXPIRED'
     when 'CONFIRMED' then 'BOOKING_CONFIRMED'
     else 'PAYMENT_REQUIRED' end,
     'appointments',new.id,jsonb_build_object('from_state',old.state,'to_state',new.state,
       'acceptance_source',new.acceptance_source));
 end if;
 return new;
end; $$;

-- Payment settlement remains authoritative; late-payment reconciliation is not an email job.
create or replace function private.record_verified_payment(p_payment uuid,p_event_id text,p_paid_at timestamptz)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.payments; a public.appointments; result text;
begin
 if current_setting('role',true) <> 'service_role' then raise exception 'Backend only'; end if;
 perform private.lock_schedule();
 select * into p from public.payments where id=p_payment for update;
 if not found then raise exception 'Unknown payment'; end if;
 select * into a from public.appointments where id=p.appointment_id for update;
 if p.state='SUCCEEDED' then return coalesce(p.exception_reason,case when a.state='CONFIRMED' then 'CONFIRMED' else 'RECORDED' end); end if;
 if p_paid_at is null or p_paid_at > clock_timestamp() or p_paid_at < p.created_at then raise exception 'Invalid provider payment timestamp'; end if;
 insert into public.payment_events(provider,provider_event_id,payment_id,processed_at)
 values(p.provider,p_event_id,p.id,clock_timestamp());
 result := 'RECORDED';
 if a.state='AWAITING_PAYMENT' and clock_timestamp() < a.payment_due_at and p_paid_at < a.payment_due_at then
   update public.payments set state='SUCCEEDED',paid_at=p_paid_at,verified_at=clock_timestamp() where id=p.id;
   if (select coalesce(sum(amount),0) from public.payments where appointment_id=a.id and state='SUCCEEDED' and exception_reason is null) >= a.required_payment_amount then
     update public.appointments set state='CONFIRMED' where id=a.id;
     result := 'CONFIRMED';
   end if;
 elsif a.state in ('CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW') then
   update public.payments set state='SUCCEEDED',paid_at=p_paid_at,verified_at=clock_timestamp() where id=p.id;
 else
   result := 'LATE_PAYMENT_REVIEW';
   update public.payments set state='SUCCEEDED',paid_at=p_paid_at,verified_at=clock_timestamp(),exception_reason=result where id=p.id;
   if a.state='AWAITING_PAYMENT' then perform private.expire_due_payments(); end if;
 end if;
 return result;
end; $$;

-- Remove app-managed guest email recovery. Initial browser-scoped VIEW tokens remain valid.
delete from public.guest_access_tokens where scope='MANAGE';
alter table public.guest_access_tokens drop constraint if exists guest_access_tokens_scope_check;
alter table public.guest_access_tokens add constraint guest_access_tokens_scope_check check (scope = 'VIEW');

drop function if exists public.enqueue_guest_access_notification(text,text,uuid);
drop function if exists private.enqueue_guest_access_notification(text,text,uuid);
drop function if exists public.issue_guest_access_link(text,text,uuid);
drop function if exists private.issue_guest_access_link(text,text,uuid);
drop function if exists public.exchange_guest_access_link(text);
drop function if exists private.exchange_guest_access_link(text);

drop function if exists public.notification_lifecycle_current(uuid);
drop function if exists private.notification_lifecycle_current(uuid);
drop function if exists public.claim_notification_outbox_by_key(text);
drop function if exists private.claim_notification_outbox_by_key(text);
drop function if exists public.claim_notification_outbox(integer);
drop function if exists private.claim_notification_outbox(integer);
drop function if exists public.finish_notification_outbox(uuid,boolean,boolean,text);
drop function if exists private.finish_notification_outbox(uuid,boolean,boolean,text);
drop function if exists public.record_notification_delivery(uuid,text,text,text);
drop function if exists private.record_notification_delivery(uuid,text,text,text);
drop function if exists public.owner_notification_outbox_context(integer);
drop function if exists private.owner_notification_outbox_context(integer);
drop function if exists public.owner_notification_outbox(integer);
drop function if exists private.owner_notification_outbox(integer);

drop table if exists public.notification_delivery_receipts;
drop table if exists public.notification_outbox;
drop type if exists public.job_state;
