# Phase 7 — public website and customer booking

Phase 7 adds the public business website, a responsive appointment request flow for signed-in customers and guests, secure guest viewing, and customer appointment history. It keeps the existing per-business deployment model, lifecycle, approval-before-payment rule and Phase 6 availability engine. Booking submission does not charge money or reserve a slot.

## Public pages

Implemented `/`, `/services`, `/services/[slug]`, `/team`, `/team/[slug]`, `/about`, `/contact`, `/book`, `/book/confirmation` and `/booking/manage`. Public reads use a narrow, safe website-data projection over active/published catalog entries, public staff assignments, configured business details, current announcements, business hours and the latest published policy. Staff account linkage and private staff contact records never enter the public projection. Catalog images use the existing public marketing-image bucket. Business name, description, contact details, address, hours, currency and the configured primary color come from the installation's settings.

## Booking flow

The mobile-first `/book` flow guides a customer through service, eligible professional or Any Available Staff, business-local date, available time, contact details and review. It requests times from `/api/availability`; the browser does not compute availability. On every selection change, stale times are cleared. The Phase 6 database operation filters notice windows, advance windows, schedules, closures, staff eligibility, occupied buffers and DST-invalid local times.

On final submission, `public_booking_submit` takes the schedule lock and asks the same Phase 6 availability calculation to validate the requested instant. For a specific professional it rechecks that professional; for Any Available Staff it selects the deterministic least-loaded eligible professional returned by Phase 6. It then calls the established trusted request operation, which derives live price, payment mode, deposit, duration and buffers, snapshots the current policy/service, creates the initial `PENDING` event and appointment item, and preserves the request idempotency key. PENDING remains non-blocking. Acceptance remains the sole point where an appointment reserves the interval; no checkout is created in this phase.

The review screen shows the live catalog price/duration and payment configuration, plus the booking policy. It tells customers that the time is not reserved until staff accepts the request and any deposit/payment will only be requested after acceptance. Confirmation uses customer-facing state labels and makes no claim that a PENDING request is confirmed.

## Customer and guest identity

For a verified signed-in customer, the booking operation derives the customer row from `auth.uid()`. It does not accept a customer UUID. The account email is re-read from verified Auth data, so form data cannot change it. The customer can update their display name and mobile contact through the booking submission boundary; they can access appointments only through the existing customer RLS ownership predicate. Registration page visibility follows `customer_registration_enabled`; the signup action and Auth insert trigger continue to enforce that setting, while existing users can sign in.

If guest booking is enabled, the trusted operation creates a customer record without creating a Supabase Auth user. It generates no client-supplied customer ID and stores only a SHA-256 hash of a server-generated 256-bit token. The raw token is placed in an HttpOnly, SameSite=Lax cookie scoped in name to that appointment, with a 30-day expiry matching the database grant. Guest viewing requires the token; an appointment UUID or reference is insufficient. The token RPC returns only the specific appointment's customer-safe summary. Cancellation and rescheduling are not enabled. Because notifications are outside this phase, access recovery from another browser/device and email delivery of the scoped link remain Phase 8 work.

## Account experience and status language

`/account` now shows upcoming/pending requests and recent appointment history. `/account/appointments` lists the customer's appointments and `/account/appointments/[id]` shows the owned appointment's details, payment state and deadline when present. RLS and an explicit customer ID filter protect these reads. Internal enum values are presented as plain customer labels such as “Waiting for approval”, “Accepted – payment required”, “Confirmed”, “Request declined” and “Payment window expired”.

## Security and operations

The new website projection exposes only published business data. The booking function is a narrow SECURITY DEFINER boundary in the unexposed `private` schema, with a validated public invoker wrapper; execute grants remain explicit. It checks publication and guest policy, availability, service/staff eligibility, authenticated ownership, verified account email, request key reuse and guest token hash format. Appointment/item/event inserts continue through existing database triggers and constraints. The browser never receives a service-role key.

The original Phase 7 release used best-effort per-process rate limits. The Phase 7 hardening update replaces those with a shared Upstash Redis REST counter in production and a bounded local adapter in development/tests. Its migration revokes anon/authenticated execution of the availability and booking RPCs; protected Next.js routes call service-role-only wrappers. Phase 6.5 guest retry behavior is preserved: an idempotent retry returns the existing appointment ID without minting replacement guest access. The idempotency key remains in session storage per service/staff/date/time selection and is enforced by the database unique request key.

No payment gateway, payment checkout, email/SMS, n8n, notification automation, appearance editor, rescheduling, loyalty, inventory, payroll or AI feature was added.

## Database change

One additive migration, `20260930110411_public_booking_experience.sql`, adds the safe public website-data function, the trusted public registered/guest request boundary, scoped guest-token lookup, the `pgcrypto` extension for cryptographic token generation/hashing, and the narrowly updated internal request authorization for guest requests. It adds no tables or columns and preserves the lifecycle, occupied-range GiST constraint and availability engine. It is now applied to the connected project after Phases 5 and 6, using the Supabase connector; the first-five migration-history version mismatch remains and CLI pushes are still unsafe until reconciled.

## Verification

The new public-booking SQL suite exercises safe public projections, deterministic Any Available Staff, guest creation without Auth users, PENDING/event/snapshot data, no premature payment row, non-blocking PENDING, database-generated 256-bit token and stored SHA-256 hash, UUID-only denial, invalid staff/time rejection, guest retry idempotency, verified customer identity and disabled guest booking. The full database suite is configured to run it after the Phase 6 checks.

Final local verification: `npm run lint`, `npm run typecheck`, `npm test` (55 tests across 11 files), `npm run test:db` (275 PostgreSQL/PGlite checks across Phases 2–7, including 26 Phase 7 checks), and `npm run build` all pass.

The migration is verified on hosted Supabase, but live Auth sessions, browser/device guest recovery, real Vercel edge throttling and native concurrent sessions remain staging requirements. See `docs/deployment/public-booking.md` before launch.

## Phase 8 prerequisites

- Reconcile connected-project migration metadata before resuming CLI-based migration delivery; Phase 5–7 migrations are already installed remotely through the connector.
- Exercise booking on managed Supabase with separate anon, customer, staff and admin sessions, including Any Available Staff and racing acceptance.
- Configure shared edge rate limits, site origin, Auth redirect allowlists, email delivery and the business's content/legal policies.
- Decide whether guests need an expiring email-delivered access link and safe cross-device recovery; do not replace the current token hash with appointment-UUID access.
- Add notification delivery and payment integrations as separate modules. Verify provider signatures, amount/currency, idempotency, deadlines, refunds and reconciliation before collecting funds.
- Add reviewed browser E2E coverage for responsive keyboard/screen-reader interaction and real timezone/DST dates.
