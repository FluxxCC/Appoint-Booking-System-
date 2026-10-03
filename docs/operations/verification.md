# Phase 2 verification and outstanding work

This document records the Phase 2 milestone. Phase 3 now implements auth screens, customer profiles, TOTP, protected shells and owner staff account invitation/linking. See [Phase 3 report](phase-3-report.md) and [authentication setup](../deployment/authentication-setup.md) for current verification and setup boundaries.

## Automated checks

- `npm run lint`: ESLint/Next.js/TypeScript rules.
- `npm run typecheck`: strict TypeScript.
- `npm test`: lifecycle branching, blocking states and currency minor-unit formatting.
- `npm run test:db`: migrates a fresh embedded PostgreSQL database, supplies a test-only Supabase identity shim and verifies RLS/transaction behavior.
- `npm run build`: production Next.js build, no credentials required for the static foundation page.

Database assertions cover public/private fields, all-table RLS, cross-account reads/writes, owner MFA, self-promotion rejection, staff assignment, idempotent booking requests, competing pending requests, exclusion constraints, payment-before-acceptance rejection, verified confirmation, immutable snapshots, buffer overlap, exact adjacency, completed history, closure conflicts, expiry/rebooking, customer-visible notes, late-payment exceptions, refund caps and protected backend functions.

PGlite runs single-session PostgreSQL, not a mock SQL parser. The auth schema in its harness is a shim, not the real Supabase Auth service. True multi-connection races and Supabase PostgREST/Auth/Storage behavior must be verified in staging. In particular, run two simultaneous acceptance transactions for overlapping requests and concurrent payment/expiry/closure transactions, asserting exactly one valid reservation and no lost financial events.

## Not implemented in this phase

- Full public website, booking UI, dashboards, auth screens and appearance editor.
- Guest verification/management endpoint, rate limiting and token exchange.
- Provider checkout/signature verification, external refunds and automatic late-payment reacquisition.
- Scheduler, outbox worker, retries/leases, email/SMS and operational alerts.
- Atomic rescheduling; immutable intervals prevent ad hoc changes until its dedicated command exists.
- Multi-service, overnight/multi-day and resource-capacity appointments.
- Owner-transfer UI, account suspension command and retention/pseudonymization workflow.
- Upload validation/Storage policies, reporting queries and revenue recognition.
- Vercel/Supabase project provisioning, actual deployment, managed advisors and backup restore tests.

No claim of production deployment/readiness is made by a passing foundation build. The database boundaries are implemented; the above integrations and operational checks remain required before launch.
