# Phase 2 implementation report

## Files created

Application/configuration:

- package.json, package-lock.json, .npmrc, .gitignore, .env.example
- next.config.ts, next-env.d.ts, tsconfig.json, eslint.config.mjs, postcss.config.mjs
- src/app/layout.tsx, src/app/globals.css, src/app/(public)/page.tsx
- src/proxy.ts, src/config/env.ts, src/config/defaults.ts
- src/lib/supabase/browser.ts, server.ts, privileged.server.ts
- src/lib/auth/require-user.server.ts
- src/lib/money/index.ts, src/lib/time/index.ts, src/lib/payments/provider.ts
- src/features/appointments/state-machine.ts, schemas.ts, service.server.ts
- src/types/database.generated.ts
- Reserved feature/route/infrastructure/test folders with .gitkeep files

Database/testing/documentation:

- supabase/config.toml, supabase/seed.sql
- Three SQL migrations listed below
- scripts/database-harness.mjs, scripts/test-database.mjs, scripts/generate-foundation-types.mjs
- tests/unit/appointments.test.ts
- README.md
- docs/architecture/system-architecture.md
- docs/deployment/supabase-setup.md
- docs/operations/verification.md, phase-2-report.md

Generated node_modules, .next and tsconfig.tsbuildinfo are ignored build artifacts.

## Migrations

1. `20260929123406_foundation.sql`: all 25 entities, enums, constraints, indexes, overlap exclusion and immutable history.
2. `20260929123409_lifecycle.sql`: authorization helpers, schedule validation, request/accept/transition/payment/expiration functions, audit/outbox transitions and refund guards.
3. `20260929123412_authorization.sql`: explicit grants, RLS, MFA administration, owner role management and management audit.

## Tables

business_settings, booking_policy_versions, website_settings, profiles, user_roles, customers, staff, service_categories, services, staff_services, business_hours, staff_working_hours, staff_schedule_exceptions, business_closures, appointments, appointment_items, appointment_events, appointment_notes, guest_access_tokens, payments, refunds, payment_events, announcements, notification_outbox, audit_logs.

## RLS

All tables have RLS. Published catalog rows and safe staff columns are public. Customers read only owned protected records. Staff access is assignment-based, with limited contact and note access. Management policies require live OWNER/ADMIN role and MFA. Only OWNER may change roles. Appointment/payment writes use narrow RPCs or trusted backend operations; guest tokens, provider events and outbox have no browser grants. No user metadata grants authority.

## Lifecycle and concurrency

PENDING is non-blocking. Authorized acceptance acquires the staff interval atomically and records ACCEPTED; a deferred guard requires it to resolve in that transaction. PAY_AT_BUSINESS becomes CONFIRMED. DEPOSIT/FULL_PAYMENT becomes AWAITING_PAYMENT with a deadline. Verified timely funds confirm; explicit expiry releases the slot. Confirmed appointments support check-in, in-progress, completion, cancellation and guarded no-show. Payment/refund state remains independent.

A GiST exclusion constraint covers staff UUID plus half-open occupied range including buffers, for all blocking and historical states. Schedule locks coordinate hours/closure changes and payment/expiry operations. Competing acceptance fails without partially accepting or requesting payment.

## Validation results

- npm install completed, lockfile created; install audit reported no vulnerabilities.
- npm run lint: passed without warnings after fixes.
- npm run typecheck: passed.
- npm test: 4 tests passed.
- npm run test:db: 49 database assertions passed.
- npm run build: passed (Next.js production build).

## Configuration and external work

Configure NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and NEXT_PUBLIC_SITE_URL. SUPABASE_SECRET_KEY is server-only and needed when trusted jobs/integrations are enabled. Optional CLI variables are documented in .env.example. See the setup guide for login/link, dry-run/push, advisors, type generation and controlled owner provisioning.

No credentials were supplied, no remote project was linked or modified, and no app was deployed. Docker/psql are unavailable: SQL was tested in embedded PostgreSQL with a Supabase Auth shim, not the managed services. Staging must verify real Auth/PostgREST/Storage and simultaneous database sessions. Initial seed data is intentionally empty.

Full interfaces, guest verification/rate limiting, provider integration, scheduling/outbox delivery, rescheduling, upload policies and production operations remain out of scope. Late payments are safely recorded for review; automatic reacquisition/refund is deferred. See verification.md for the complete follow-up list.
