-- One independent business database. No tenant discriminator.
create schema if not exists extensions;
create schema if not exists private;
revoke all on schema private from public;
create extension if not exists btree_gist with schema extensions;
set search_path = public, extensions;
create type public.app_role as enum ('OWNER','ADMIN','STAFF');
create type public.appointment_state as enum ('PENDING','DECLINED','ACCEPTED','AWAITING_PAYMENT','PAYMENT_EXPIRED','CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','CANCELLED','NO_SHOW');
create type public.payment_mode as enum ('PAY_AT_BUSINESS','DEPOSIT','FULL_PAYMENT');
create type public.payment_state as enum ('PENDING','SUCCEEDED','FAILED','CANCELLED');
create type public.refund_state as enum ('PENDING','SUCCEEDED','FAILED');
create type public.schedule_exception_kind as enum ('UNAVAILABLE','EXTRA_HOURS');
create type public.note_visibility as enum ('INTERNAL','CUSTOMER');
create type public.job_state as enum ('PENDING','PROCESSING','DELIVERED','FAILED');

create table public.business_settings (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  name text not null check (length(name) between 1 and 200),
  timezone text not null default 'Asia/Manila',
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  contact_email text, contact_phone text, address text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.booking_policy_versions (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique check (version > 0),
  payment_window_minutes integer not null default 30 check (payment_window_minutes between 1 and 1440),
  minimum_notice_minutes integer not null default 60 check (minimum_notice_minutes >= 0),
  maximum_advance_days integer not null default 90 check (maximum_advance_days between 1 and 730),
  cancellation_notice_minutes integer not null default 1440 check (cancellation_notice_minutes >= 0),
  no_show_grace_minutes integer not null default 15 check (no_show_grace_minutes >= 0),
  terms text not null, published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.website_settings (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  logo_path text, hero_image_path text,
  primary_color text not null default '#0f766e' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  font_key text not null default 'system' check (font_key in ('system','serif','sans')),
  sections jsonb not null default '{}' check (jsonb_typeof(sections) = 'object'),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 200),
  avatar_path text, disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (auth_user_id, role),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  display_name text not null check (length(display_name) between 1 and 200),
  email text, phone text,
  check (email is not null or phone is not null),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  display_name text not null, slug text not null unique,
  bio text, photo_path text,
  active boolean not null default true, published boolean not null default false,
  bookable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text not null unique,
  sort_order integer not null default 0, published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.service_categories(id) on delete restrict,
  name text not null, slug text not null unique, description text,
  price_amount bigint not null check (price_amount between 0 and 9007199254740991),
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  buffer_before_minutes integer not null default 0 check (buffer_before_minutes between 0 and 240),
  buffer_after_minutes integer not null default 0 check (buffer_after_minutes between 0 and 240),
  payment_mode public.payment_mode not null default 'PAY_AT_BUSINESS',
  deposit_amount bigint not null default 0,
  active boolean not null default true, published boolean not null default false,
  check ((payment_mode = 'DEPOSIT' and deposit_amount > 0 and deposit_amount <= price_amount)
  or (payment_mode <> 'DEPOSIT' and deposit_amount = 0)),
  check (payment_mode <> 'FULL_PAYMENT' or price_amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff_services (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  active boolean not null default true,
  unique (staff_id, service_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_hours (
  id uuid primary key default gen_random_uuid(),
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time not null, closes_at time not null,
  check (opens_at < closes_at), unique (weekday, opens_at),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff_working_hours (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete restrict,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null, ends_at time not null,
  check (starts_at < ends_at), unique (staff_id, weekday, starts_at),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff_schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete restrict,
  kind public.schedule_exception_kind not null,
  starts_at timestamptz not null, ends_at timestamptz not null,
  reason text, check (starts_at < ends_at),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_closures (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null, ends_at timestamptz not null,
  public_reason text not null, check (starts_at < ends_at),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  staff_id uuid not null references public.staff(id) on delete restrict,
  policy_version_id uuid not null references public.booking_policy_versions(id) on delete restrict,
  request_key uuid not null unique,
  state public.appointment_state not null default 'PENDING',
  starts_at timestamptz not null, ends_at timestamptz not null,
  buffer_before_minutes integer not null default 0 check (buffer_before_minutes between 0 and 240),
  buffer_after_minutes integer not null default 0 check (buffer_after_minutes between 0 and 240),
  occupied_range tstzrange not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  total_amount bigint not null check (total_amount between 0 and 9007199254740991),
  payment_mode_snapshot public.payment_mode not null,
  required_payment_amount bigint not null check (required_payment_amount >= 0 and required_payment_amount <= total_amount),
  accepted_by uuid references auth.users(id) on delete restrict, accepted_at timestamptz,
  declined_by uuid references auth.users(id) on delete restrict, declined_at timestamptz, decline_reason text,
  payment_due_at timestamptz, payment_expired_at timestamptz,
  cancelled_at timestamptz, cancellation_reason text,
  check (starts_at < ends_at),
  check ((payment_mode_snapshot = 'PAY_AT_BUSINESS' and required_payment_amount = 0)
  or (payment_mode_snapshot = 'DEPOSIT' and required_payment_amount > 0)
  or (payment_mode_snapshot = 'FULL_PAYMENT' and required_payment_amount = total_amount and total_amount > 0)),
  check (state not in ('ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW','PAYMENT_EXPIRED') or (accepted_by is not null and accepted_at is not null)),
  check (state <> 'DECLINED' or (declined_by is not null and declined_at is not null and length(trim(decline_reason)) > 0)),
  check (state <> 'AWAITING_PAYMENT' or (payment_due_at is not null and payment_mode_snapshot <> 'PAY_AT_BUSINESS')),
  check (payment_due_at is null or (payment_due_at > accepted_at and payment_due_at <= starts_at)),
  check (state <> 'PAYMENT_EXPIRED' or payment_expired_at is not null),
  check (state <> 'CANCELLED' or (cancelled_at is not null and length(trim(cancellation_reason)) > 0)),
  constraint appointments_no_staff_overlap exclude using gist
  (staff_id with =, occupied_range with &&)
  where (state in ('ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.appointment_items (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  service_name_snapshot text not null,
  price_amount bigint not null check (price_amount between 0 and 9007199254740991),
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  buffer_before_minutes integer not null check (buffer_before_minutes between 0 and 240),
  buffer_after_minutes integer not null check (buffer_after_minutes between 0 and 240),
  unique (appointment_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.appointment_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete restrict,
  from_state public.appointment_state, to_state public.appointment_state not null,
  actor_id uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.appointment_notes (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete restrict,
  author_id uuid not null references auth.users(id) on delete restrict,
  visibility public.note_visibility not null default 'INTERNAL',
  body text not null check (length(body) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.guest_access_tokens (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  scope text not null check (scope in ('VIEW','MANAGE')),
  expires_at timestamptz not null, consumed_at timestamptz, revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete restrict,
  provider text not null, provider_reference text not null,
  idempotency_key uuid not null unique,
  amount bigint not null check (amount between 1 and 9007199254740991),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  state public.payment_state not null default 'PENDING',
  paid_at timestamptz, verified_at timestamptz,
  exception_reason text,
  unique (provider, provider_reference),
  check (state <> 'SUCCEEDED' or (paid_at is not null and verified_at is not null)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  amount bigint not null check (amount between 1 and 9007199254740991),
  state public.refund_state not null default 'PENDING',
  provider_reference text unique, idempotency_key uuid not null unique,
  reason text not null, processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null, provider_event_id text not null,
  payment_id uuid references public.payments(id) on delete restrict,
  payload jsonb not null default '{}', processed_at timestamptz, error text,
  unique (provider, provider_event_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null, body text not null,
  published boolean not null default false,
  starts_at timestamptz not null default now(), ends_at timestamptz,
  check (ends_at is null or starts_at < ends_at),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments(id) on delete restrict,
  kind text not null, deduplication_key text not null unique,
  payload jsonb not null default '{}',
  state public.job_state not null default 'PENDING',
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(), locked_until timestamptz,
  last_error text, delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null, entity_table text not null, entity_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- A single-business schedule lock serializes acceptance and schedule edits.
-- This is intentionally simple at appointment-business scale.
create function private.lock_schedule() returns void language sql
set search_path = '' as $$ select pg_advisory_xact_lock(70421, 1); $$;

create function private.touch_updated_at() returns trigger language plpgsql
set search_path = '' as $$
begin new.updated_at := clock_timestamp(); return new; end; $$;

create function private.reject_mutation() returns trigger language plpgsql
set search_path = '' as $$
begin raise exception 'Historical records are immutable'; end; $$;

-- Enable RLS and deny access before subsequent migrations add explicit grants.
alter table public.business_settings enable row level security;
revoke all on public.business_settings from anon, authenticated;
create trigger touch_updated_at before update on public.business_settings for each row execute function private.touch_updated_at();
alter table public.booking_policy_versions enable row level security;
revoke all on public.booking_policy_versions from anon, authenticated;
create trigger touch_updated_at before update on public.booking_policy_versions for each row execute function private.touch_updated_at();
alter table public.website_settings enable row level security;
revoke all on public.website_settings from anon, authenticated;
create trigger touch_updated_at before update on public.website_settings for each row execute function private.touch_updated_at();
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
create trigger touch_updated_at before update on public.profiles for each row execute function private.touch_updated_at();
alter table public.user_roles enable row level security;
revoke all on public.user_roles from anon, authenticated;
create trigger touch_updated_at before update on public.user_roles for each row execute function private.touch_updated_at();
alter table public.customers enable row level security;
revoke all on public.customers from anon, authenticated;
create trigger touch_updated_at before update on public.customers for each row execute function private.touch_updated_at();
alter table public.staff enable row level security;
revoke all on public.staff from anon, authenticated;
create trigger touch_updated_at before update on public.staff for each row execute function private.touch_updated_at();
alter table public.service_categories enable row level security;
revoke all on public.service_categories from anon, authenticated;
create trigger touch_updated_at before update on public.service_categories for each row execute function private.touch_updated_at();
alter table public.services enable row level security;
revoke all on public.services from anon, authenticated;
create trigger touch_updated_at before update on public.services for each row execute function private.touch_updated_at();
alter table public.staff_services enable row level security;
revoke all on public.staff_services from anon, authenticated;
create trigger touch_updated_at before update on public.staff_services for each row execute function private.touch_updated_at();
alter table public.business_hours enable row level security;
revoke all on public.business_hours from anon, authenticated;
create trigger touch_updated_at before update on public.business_hours for each row execute function private.touch_updated_at();
alter table public.staff_working_hours enable row level security;
revoke all on public.staff_working_hours from anon, authenticated;
create trigger touch_updated_at before update on public.staff_working_hours for each row execute function private.touch_updated_at();
alter table public.staff_schedule_exceptions enable row level security;
revoke all on public.staff_schedule_exceptions from anon, authenticated;
create trigger touch_updated_at before update on public.staff_schedule_exceptions for each row execute function private.touch_updated_at();
alter table public.business_closures enable row level security;
revoke all on public.business_closures from anon, authenticated;
create trigger touch_updated_at before update on public.business_closures for each row execute function private.touch_updated_at();
alter table public.appointments enable row level security;
revoke all on public.appointments from anon, authenticated;
create trigger touch_updated_at before update on public.appointments for each row execute function private.touch_updated_at();
alter table public.appointment_items enable row level security;
revoke all on public.appointment_items from anon, authenticated;
create trigger touch_updated_at before update on public.appointment_items for each row execute function private.touch_updated_at();
alter table public.appointment_events enable row level security;
revoke all on public.appointment_events from anon, authenticated;
create trigger touch_updated_at before update on public.appointment_events for each row execute function private.touch_updated_at();
alter table public.appointment_notes enable row level security;
revoke all on public.appointment_notes from anon, authenticated;
create trigger touch_updated_at before update on public.appointment_notes for each row execute function private.touch_updated_at();
alter table public.guest_access_tokens enable row level security;
revoke all on public.guest_access_tokens from anon, authenticated;
create trigger touch_updated_at before update on public.guest_access_tokens for each row execute function private.touch_updated_at();
alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;
create trigger touch_updated_at before update on public.payments for each row execute function private.touch_updated_at();
alter table public.refunds enable row level security;
revoke all on public.refunds from anon, authenticated;
create trigger touch_updated_at before update on public.refunds for each row execute function private.touch_updated_at();
alter table public.payment_events enable row level security;
revoke all on public.payment_events from anon, authenticated;
create trigger touch_updated_at before update on public.payment_events for each row execute function private.touch_updated_at();
alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;
create trigger touch_updated_at before update on public.announcements for each row execute function private.touch_updated_at();
alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from anon, authenticated;
create trigger touch_updated_at before update on public.notification_outbox for each row execute function private.touch_updated_at();
alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon, authenticated;
create trigger touch_updated_at before update on public.audit_logs for each row execute function private.touch_updated_at();

create index appointments_customer_start_idx on public.appointments(customer_id, starts_at desc);
create index appointments_staff_start_idx on public.appointments(staff_id, starts_at);
create index appointments_expiry_idx on public.appointments(payment_due_at) where state = 'AWAITING_PAYMENT';
create index appointments_policy_idx on public.appointments(policy_version_id);
create index appointments_pending_idx on public.appointments(staff_id, created_at) where state = 'PENDING';
create index staff_services_service_idx on public.staff_services(service_id);
create index services_category_idx on public.services(category_id);
create index staff_exceptions_staff_start_idx on public.staff_schedule_exceptions(staff_id, starts_at);
create index business_closures_range_idx on public.business_closures using gist(tstzrange(starts_at, ends_at, '[)'));
create index items_service_idx on public.appointment_items(service_id);
create index appointment_events_appointment_idx on public.appointment_events(appointment_id, created_at);
create index appointment_notes_appointment_idx on public.appointment_notes(appointment_id);
create index guest_tokens_appointment_idx on public.guest_access_tokens(appointment_id);
create index payments_appointment_idx on public.payments(appointment_id);
create unique index payments_one_pending_attempt_idx on public.payments(appointment_id) where state = 'PENDING';
create index refunds_payment_idx on public.refunds(payment_id);
create index payment_events_payment_idx on public.payment_events(payment_id);
create index outbox_pending_idx on public.notification_outbox(available_at) where state = 'PENDING';
create index outbox_appointment_idx on public.notification_outbox(appointment_id);
create index audit_entity_idx on public.audit_logs(entity_table, entity_id, created_at);
create index appointments_accepted_by_idx on public.appointments(accepted_by);
create index appointments_declined_by_idx on public.appointments(declined_by);
create index appointment_events_actor_idx on public.appointment_events(actor_id);
create index appointment_notes_author_idx on public.appointment_notes(author_id);
create index audit_logs_actor_idx on public.audit_logs(actor_id);

create trigger immutable_policy before update or delete on public.booking_policy_versions
for each row execute function private.reject_mutation();
create trigger immutable_items before update or delete on public.appointment_items
for each row execute function private.reject_mutation();
create trigger immutable_events before update or delete on public.appointment_events
for each row execute function private.reject_mutation();
create trigger immutable_audit before update or delete on public.audit_logs
for each row execute function private.reject_mutation();
reset search_path;
