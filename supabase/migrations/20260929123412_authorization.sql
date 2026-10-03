-- Deny by default, including function EXECUTE (Postgres otherwise grants PUBLIC).
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;
grant execute on all functions in schema private to service_role;
grant execute on all functions in schema public to service_role;
grant all on all tables in schema public to service_role;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;
alter default privileges in schema public revoke all on tables from anon, authenticated;

grant execute on function private.is_active_user(), private.is_admin(), private.is_owner(),
private.is_assigned_staff(uuid), private.owns_customer(uuid), private.can_read_appointment(uuid),
private.can_manage_appointment(uuid), private.lock_schedule() to authenticated;
grant execute on function private.request_appointment(uuid,uuid,uuid,timestamptz,uuid),
private.accept_appointment(uuid), private.transition_appointment(uuid,public.appointment_state,text) to authenticated;
grant execute on function public.request_appointment(uuid,uuid,uuid,timestamptz,uuid),
public.accept_appointment(uuid), public.transition_appointment(uuid,public.appointment_state,text) to authenticated;

-- Live roles, active profile and MFA protect administrative access.
create or replace function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select private.is_active_user() and coalesce(auth.jwt()->>'aal' = 'aal2',false)
 and exists(select 1 from public.user_roles where auth_user_id = auth.uid() and role in ('ADMIN','OWNER'));
$$;
create or replace function private.is_owner() returns boolean language sql stable security definer set search_path = '' as $$
 select private.is_active_user() and coalesce(auth.jwt()->>'aal' = 'aal2',false)
 and exists(select 1 from public.user_roles where auth_user_id = auth.uid() and role = 'OWNER');
$$;

create function private.can_read_customer(p_customer uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and (private.is_admin() or private.owns_customer(p_customer) or
 exists(select 1 from public.appointments a where a.customer_id=p_customer and private.is_assigned_staff(a.staff_id)
 and a.state in ('PENDING','ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS')
 and a.ends_at > clock_timestamp() - interval '1 day'));
$$;
revoke all on function private.can_read_customer(uuid) from public, anon, authenticated;
grant execute on function private.can_read_customer(uuid) to authenticated, service_role;

-- Public catalog: table grants and row policies are both required.
grant select on public.business_settings to anon, authenticated;
create policy published_read on public.business_settings for select to anon, authenticated using (published);
create policy admin_read on public.business_settings for select to authenticated using ((select private.is_admin()));
grant select on public.booking_policy_versions to anon, authenticated;
create policy published_read on public.booking_policy_versions for select to anon, authenticated using (published);
create policy admin_read on public.booking_policy_versions for select to authenticated using ((select private.is_admin()));
grant select on public.website_settings to anon, authenticated;
create policy published_read on public.website_settings for select to anon, authenticated using (published);
create policy admin_read on public.website_settings for select to authenticated using ((select private.is_admin()));
grant select on public.service_categories to anon, authenticated;
create policy published_read on public.service_categories for select to anon, authenticated using (published);
create policy admin_read on public.service_categories for select to authenticated using ((select private.is_admin()));
grant select on public.services to anon, authenticated;
create policy published_read on public.services for select to anon, authenticated using (published and active);
create policy admin_read on public.services for select to authenticated using ((select private.is_admin()));
grant select on public.announcements to anon, authenticated;
create policy published_read on public.announcements for select to anon, authenticated using (published and starts_at <= now() and (ends_at is null or ends_at > now()));
create policy admin_read on public.announcements for select to authenticated using ((select private.is_admin()));

-- Column grants prevent public disclosure of the staff account linkage.
grant select (id,display_name,slug,bio,photo_path,active,published,bookable,created_at,updated_at)
on public.staff to anon, authenticated;
create policy staff_public_read on public.staff for select to anon, authenticated using (published and active);
create policy staff_management_read on public.staff for select to authenticated using ((select private.is_admin()) or private.is_assigned_staff(id));

grant select on public.business_hours, public.business_closures to anon, authenticated;
create policy public_hours on public.business_hours for select to anon, authenticated using (true);
create policy public_closures on public.business_closures for select to anon, authenticated using (true);
grant select on public.staff_services to anon, authenticated;
create policy public_staff_services on public.staff_services for select to anon, authenticated using
(active and exists(select 1 from public.staff where id=staff_id and published and active)
and exists(select 1 from public.services where id=service_id and published and active));
create policy admin_staff_services on public.staff_services for select to authenticated using ((select private.is_admin()));
grant insert, update, delete on public.business_settings to authenticated;
create policy admin_insert on public.business_settings for insert to authenticated with check ((select private.is_admin()));
create policy admin_update on public.business_settings for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_delete on public.business_settings for delete to authenticated using ((select private.is_admin()));
grant insert, update, delete on public.website_settings to authenticated;
create policy admin_insert on public.website_settings for insert to authenticated with check ((select private.is_admin()));
create policy admin_update on public.website_settings for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_delete on public.website_settings for delete to authenticated using ((select private.is_admin()));
grant insert, update, delete on public.service_categories to authenticated;
create policy admin_insert on public.service_categories for insert to authenticated with check ((select private.is_admin()));
create policy admin_update on public.service_categories for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_delete on public.service_categories for delete to authenticated using ((select private.is_admin()));
grant insert, update, delete on public.services to authenticated;
create policy admin_insert on public.services for insert to authenticated with check ((select private.is_admin()));
create policy admin_update on public.services for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_delete on public.services for delete to authenticated using ((select private.is_admin()));
grant insert, update, delete on public.staff to authenticated;
create policy admin_insert on public.staff for insert to authenticated with check ((select private.is_admin()));
create policy admin_update on public.staff for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_delete on public.staff for delete to authenticated using ((select private.is_admin()));
grant insert, update, delete on public.staff_services to authenticated;
create policy admin_insert on public.staff_services for insert to authenticated with check ((select private.is_admin()));
create policy admin_update on public.staff_services for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_delete on public.staff_services for delete to authenticated using ((select private.is_admin()));
grant insert, update, delete on public.business_hours to authenticated;
create policy admin_insert on public.business_hours for insert to authenticated with check ((select private.is_admin()));
create policy admin_update on public.business_hours for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_delete on public.business_hours for delete to authenticated using ((select private.is_admin()));
grant insert, update, delete on public.staff_working_hours to authenticated;
create policy admin_insert on public.staff_working_hours for insert to authenticated with check ((select private.is_admin()));
create policy admin_update on public.staff_working_hours for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_delete on public.staff_working_hours for delete to authenticated using ((select private.is_admin()));
grant insert, update, delete on public.staff_schedule_exceptions to authenticated;
create policy admin_insert on public.staff_schedule_exceptions for insert to authenticated with check ((select private.is_admin()));
create policy admin_update on public.staff_schedule_exceptions for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_delete on public.staff_schedule_exceptions for delete to authenticated using ((select private.is_admin()));
grant insert, update, delete on public.business_closures to authenticated;
create policy admin_insert on public.business_closures for insert to authenticated with check ((select private.is_admin()));
create policy admin_update on public.business_closures for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_delete on public.business_closures for delete to authenticated using ((select private.is_admin()));
grant insert, update, delete on public.announcements to authenticated;
create policy admin_insert on public.announcements for insert to authenticated with check ((select private.is_admin()));
create policy admin_update on public.announcements for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_delete on public.announcements for delete to authenticated using ((select private.is_admin()));

-- Policy versions are append-only; changing a policy creates a new version.
grant insert on public.booking_policy_versions to authenticated;
create policy admin_policy_insert on public.booking_policy_versions for insert to authenticated with check ((select private.is_admin()));

grant select on public.profiles, public.user_roles, public.customers, public.staff_working_hours,
public.staff_schedule_exceptions, public.appointments, public.appointment_items,
public.appointment_events, public.appointment_notes, public.payments, public.refunds, public.audit_logs to authenticated;
create policy profile_read on public.profiles for select to authenticated using (auth_user_id=(select auth.uid()) or (select private.is_admin()));
grant update (display_name,avatar_path) on public.profiles to authenticated;
create policy profile_update on public.profiles for update to authenticated
using (auth_user_id=(select auth.uid()) and (select private.is_active_user()))
with check (auth_user_id=(select auth.uid()) and (select private.is_active_user()));
create policy role_read on public.user_roles for select to authenticated using (auth_user_id=(select auth.uid()) or (select private.is_admin()));
grant insert,delete on public.user_roles to authenticated;
create policy owner_role_insert on public.user_roles for insert to authenticated with check ((select private.is_owner()));
create policy owner_role_delete on public.user_roles for delete to authenticated using ((select private.is_owner()));

create policy customer_read on public.customers for select to authenticated using (private.can_read_customer(id));
grant insert on public.customers to authenticated;
grant update (display_name,email,phone) on public.customers to authenticated;
create policy customer_insert on public.customers for insert to authenticated
with check ((auth_user_id=(select auth.uid()) and (select private.is_active_user())) or (select private.is_admin()));
create policy customer_update on public.customers for update to authenticated
using (private.owns_customer(id) or (select private.is_admin())) with check (private.owns_customer(id) or (select private.is_admin()));
create policy staff_hours_read on public.staff_working_hours for select to authenticated using ((select private.is_admin()) or private.is_assigned_staff(staff_id));
create policy staff_exceptions_read on public.staff_schedule_exceptions for select to authenticated using ((select private.is_admin()) or private.is_assigned_staff(staff_id));
create policy appointment_read on public.appointments for select to authenticated using
((select private.is_admin()) or private.is_assigned_staff(staff_id) or private.owns_customer(customer_id));
create policy item_read on public.appointment_items for select to authenticated using (private.can_read_appointment(appointment_id));
create policy event_read on public.appointment_events for select to authenticated using (private.can_read_appointment(appointment_id));
create policy note_read on public.appointment_notes for select to authenticated using
(private.can_manage_appointment(appointment_id) or (visibility='CUSTOMER' and private.can_read_appointment(appointment_id)));
grant insert on public.appointment_notes to authenticated;
create policy staff_note_insert on public.appointment_notes for insert to authenticated
with check (author_id=(select auth.uid()) and private.can_manage_appointment(appointment_id));

create policy payment_read on public.payments for select to authenticated using
((select private.is_admin()) or exists(select 1 from public.appointments a where a.id=appointment_id and private.owns_customer(a.customer_id)));
create policy refund_read on public.refunds for select to authenticated using
((select private.is_admin()) or exists(select 1 from public.payments p where p.id=payment_id));
create policy audit_read on public.audit_logs for select to authenticated using ((select private.is_admin()));

-- guest_access_tokens, payment_events and notification_outbox have NO browser grants or policies.
-- Guest workflows will be served by a verified, rate-limited backend in a later phase.

create function private.audit_management_change() returns trigger language plpgsql security definer set search_path = '' as $$
declare row_id uuid;
begin
 if tg_op='DELETE' then row_id:=old.id; else row_id:=new.id; end if;
 insert into public.audit_logs(actor_id,action,entity_table,entity_id,details)
 values(auth.uid(),tg_op,tg_table_name,row_id,
 case when tg_table_name='user_roles' then jsonb_build_object('before',to_jsonb(old),'after',to_jsonb(new))
 else jsonb_build_object('operation',tg_op) end);
 return coalesce(new,old);
end; $$;
revoke all on function private.audit_management_change() from public,anon,authenticated;

create function private.protect_last_owner() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 perform private.lock_schedule();
 if old.role='OWNER' and not exists(select 1 from public.user_roles where role='OWNER' and id<>old.id)
 then raise exception 'Cannot remove the last owner'; end if;
 return old;
end; $$;
revoke all on function private.protect_last_owner() from public,anon,authenticated;
create trigger protect_last_owner before delete on public.user_roles for each row execute function private.protect_last_owner();
create trigger role_write_lock before insert or update or delete on public.user_roles for each statement execute function private.schedule_write_lock();

-- No storage buckets or upload policies are opened until upload validation is implemented.
create trigger audit_management_change after insert or update or delete on public.business_settings for each row execute function private.audit_management_change();
create trigger audit_management_change after insert or update or delete on public.website_settings for each row execute function private.audit_management_change();
create trigger audit_management_change after insert or update or delete on public.service_categories for each row execute function private.audit_management_change();
create trigger audit_management_change after insert or update or delete on public.services for each row execute function private.audit_management_change();
create trigger audit_management_change after insert or update or delete on public.staff for each row execute function private.audit_management_change();
create trigger audit_management_change after insert or update or delete on public.staff_services for each row execute function private.audit_management_change();
create trigger audit_management_change after insert or update or delete on public.business_hours for each row execute function private.audit_management_change();
create trigger audit_management_change after insert or update or delete on public.staff_working_hours for each row execute function private.audit_management_change();
create trigger audit_management_change after insert or update or delete on public.staff_schedule_exceptions for each row execute function private.audit_management_change();
create trigger audit_management_change after insert or update or delete on public.business_closures for each row execute function private.audit_management_change();
create trigger audit_management_change after insert or update or delete on public.announcements for each row execute function private.audit_management_change();
create trigger audit_management_change after insert or update or delete on public.booking_policy_versions for each row execute function private.audit_management_change();
create trigger audit_management_change after insert or update or delete on public.user_roles for each row execute function private.audit_management_change();
create trigger audit_management_change after insert or update or delete on public.refunds for each row execute function private.audit_management_change();
