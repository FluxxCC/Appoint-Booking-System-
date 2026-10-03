# Phase 4 — admin dashboard and business configuration

Implemented in the existing modular monolith. Separate deployments, Phase 2 tables and lifecycle, Phase 3 authentication, live role/MFA checks, and per-business configuration are preserved. No remote Supabase project was changed.

## 1. Files created and modified

Created:

- `supabase/migrations/20260930080239_admin_configuration.sql`: additive settings columns, atomic settings/hours operations, local-time conversion, closure/announcement operations, admin aggregation, registration enforcement and indexes.
- `src/features/admin/{actions.ts,data.server.ts,schemas.ts,types.ts,format.ts,forms.tsx,ui.tsx,pages.tsx}`: feature-level authorization, validation, reads, mutations, reusable management UI and page composition.
- `src/app/(admin)/admin/{settings,closures,announcements,appointments,calendar,customers,payments,reports}/page.tsx`.
- `src/app/(admin)/admin/appointments/[id]/page.tsx` and `customers/[id]/page.tsx`.
- `src/app/(admin)/admin/loading.tsx`.
- `tests/unit/admin-validation.test.ts`, `tests/integration/admin-access.test.ts`, `tests/integration/admin-render.test.ts`, `scripts/test-admin-database.mjs`.
- `docs/deployment/admin-configuration.md` and this report.

Modified:

- Existing admin home/error boundary, shared navigation and active-section detection.
- `src/features/auth/actions.ts` checks registration configuration before calling Auth; the migration also enforces this at Auth-user creation.
- `scripts/database-harness.mjs`, `scripts/generate-foundation-types.mjs`, `src/types/database.generated.ts`: Auth invitation shim, correctly generated nullable RPC arguments/boolean return types, regenerated schema types.
- `tests/integration/registration.test.ts`, `package.json`: registration-toggle tests and Phase 4 database test command.
- README, architecture and Auth deployment notes. No dependencies added and no existing migration rewritten.

## 2. Dashboard

Real server-authorized counts for today's appointments, pending requests across dates, today's confirmed/completed/no-show appointments, today's verified cash receipts and upcoming accepted reservations. Today's schedule, pending requests, next upcoming appointments and recent management audit activity are populated from PostgreSQL. Empty data returns zero/empty states; database failures produce an error state rather than fabricated zeros.

## 3. Business settings

Business name/description/email/phone/address/timezone/currency, scheduling interval, default buffer, lead time, advance window, post-acceptance payment deadline, guest-booking toggle and customer-registration toggle. Staff approval is always required. Booking terms are editable because new rules publish immutable policy versions. Settings save atomically, rejects stale edits, and preserves cancellation/no-show rules. Existing appointments keep their original snapshots. Timezone/currency changes after booking remain blocked.

## 4. Business hours

Weekly open/closed days via zero or more intervals, split shifts, add/remove intervals and atomic save. Server validation and the database reject reversed or overlapping intervals. Existing schedule protection runs at transaction end for weekly replacement so temporary deletes do not invalidate otherwise unchanged hours. Failed changes roll back fully; appointment overlap constraints remain intact.

## 5. Closures

Full-day and partial closures, public reasons, pagination and confirmed deletion. Local dates/times convert through the configured business timezone. DST gaps/duplicates are rejected. Closures cannot invalidate active reservations. Existing staff exceptions/extra hours were not redesigned.

## 6. Announcements

Create, edit, publish/unpublish, optional local display start/end and confirmed deletion using the existing table/RLS/audit rules. Blank start means now; blank end means indefinite. Unpublishing keeps a draft. Text is escaped by React.

## 7. Appointment management

Paginated actual records; search customer/service/staff/reference; status and business-date filters. Details show customer link, staff, immutable service/price snapshot, start/end, payment requirement/required amount, gross collection status, deadline, reasons, actual payment attempts/refunds and transition timeline. No manual state editing or early-payment path was introduced.

## 8. Calendar

Daily schedule with previous/next/today navigation, date picker, staff/start/end/status and pagination in start-time order. Pending requests remain visibly distinct from reservations. No drag-and-drop/rescheduling.

## 9. Customers

Paginated name/contact search, appointment counts, last appointment and next reservation. Details show contact information, next upcoming reservations, paginated history and no-show history/count. All data uses the current administrator's credentials and existing RLS. No auth-user linkage is returned in customer lists/details.

## 10. Payments and reports

Actual attempts, amounts, appointment payment requirement, provider, status, paid/created dates, payment exceptions and refund states. Lifetime status counts, gross collections, successful refunds, net cash collections and outstanding balances are grouped by currency. No fake payments or provider integration. Full metric definitions are in the deployment guide.

## 11. Tests and validation

Local validation on September 30, 2026:

- 39 application checks across seven files, including authorization before data access/mutation, registration gates, validation, redirect/role behavior and empty/admin page rendering.
- 147 database checks: 49 Phase 2 + 34 Phase 3 + 64 Phase 4, using real embedded PostgreSQL with an Auth shim. Covers real-data aggregation beyond one page, settings/policy persistence, rollback, overlap protection, closures, DST, announcements/RLS, customer privacy, money/refund semantics, direct-signup blocking, invitation completion and disabled admin access.
- Lint passed with no warnings; TypeScript checking and the production build passed.
- Isolated server-rendered dashboard/settings fixtures were checked in the browser at desktop and 390px mobile width: no document overflow; settings inputs all had accessible labels. Fixtures are generated only under ignored `out/phase4-preview`, never served by application routes. This verifies static layout, not hydrated mutations or hosted authentication.

## 12. Remaining configuration and deferred scope

Configure actual business identity, timezone/currency, policy terms and weekly hours after deployment. Scheduling interval/default buffer are defaults for later interfaces; the future guest endpoint must read the guest toggle. Booking flow, service/staff management, appearance editor, public website redesign, payment gateway, refund execution and rescheduling remain deferred. Existing owner staff-account setup remains intact and OWNER-only role grants were preserved.

## 13. Connected Supabase work

Apply the migration to staging, run managed advisors, regenerate linked-project types and verify Auth/PostgREST/RLS/MFA/invitations end to end. Specifically test the private deferred registration guard against managed Auth while registration is disabled. Verify native multi-session scheduling races, SMTP, deployment redirects and backups before production. No cloud credentials, live users or emails were used for local verification.

`supabase db advisors --local --type security` was attempted but could not connect to `127.0.0.1:54322` because a local Supabase database is not running. No `.env.local` is present. Advisor results and managed Auth/PostgREST validation are therefore pending, not claimed as passed.
