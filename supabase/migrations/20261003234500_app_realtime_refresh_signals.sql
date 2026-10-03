-- Emit payload-free refresh hints for the app's existing server-rendered views.
-- Browser clients never receive row data here; they re-read through the existing
-- RPCs and RLS-protected Server Components after receiving the hint.
create or replace function private.broadcast_app_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform realtime.send('{}'::jsonb, 'refresh', 'app:changes', true);
  exception when others then
    -- A Realtime outage or missing partition must never block a business write.
    raise warning 'Realtime application invalidation failed for %.%', tg_table_schema, tg_table_name;
  end;

  if tg_table_schema = 'public' and tg_table_name = any (array[
    'business_settings', 'booking_policy_versions', 'website_settings',
    'service_categories', 'services', 'staff', 'staff_services',
    'business_hours', 'staff_working_hours', 'staff_schedule_exceptions',
    'business_closures', 'appointments', 'appointment_items', 'announcements'
  ]::text[]) then
    begin
      perform realtime.send('{}'::jsonb, 'refresh', 'public:changes', true);
    exception when others then
      raise warning 'Realtime public-site invalidation failed for %.%', tg_table_schema, tg_table_name;
    end;
  end if;

  return null;
end;
$$;

revoke all on function private.broadcast_app_change() from public, anon, authenticated, service_role;

-- Public application data: bookings, customer details, payments, notifications,
-- role data, operational logs, etc. One hint is emitted per SQL statement.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'business_settings', 'booking_policy_versions', 'website_settings',
    'profiles', 'user_roles', 'customers', 'staff', 'service_categories',
    'services', 'staff_services', 'business_hours', 'staff_working_hours',
    'staff_schedule_exceptions', 'business_closures', 'appointments',
    'appointment_items', 'appointment_events', 'appointment_notes',
    'guest_access_tokens', 'payments', 'refunds', 'payment_events',
    'announcements', 'notification_outbox', 'notification_delivery_receipts',
    'audit_logs'
  ]::text[] loop
    execute format(
      'create trigger app_data_invalidation after insert or update or delete or truncate on public.%I for each statement execute function private.broadcast_app_change()',
      table_name
    );
  end loop;

  foreach table_name in array array['staff_details', 'admin_invitations']::text[] loop
    execute format(
      'create trigger app_data_invalidation after insert or update or delete or truncate on private.%I for each statement execute function private.broadcast_app_change()',
      table_name
    );
  end loop;
end;
$$;

-- Authenticated users can receive hints only while their profile is active.
-- The channel accepts no client broadcasts, and its payload contains no rows.
create policy "active users can receive app refresh hints"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and realtime.topic() = 'app:changes'
  and (select private.is_active_user())
);

-- Anonymous visitors can only receive hints for data already projected as public.
create policy "visitors can receive public site refresh hints"
on realtime.messages
for select
to anon, authenticated
using (
  extension = 'broadcast'
  and realtime.topic() = 'public:changes'
);

comment on function private.broadcast_app_change() is
  'Sends payload-free Supabase Realtime refresh hints. Server components re-authorize all data reads.';
