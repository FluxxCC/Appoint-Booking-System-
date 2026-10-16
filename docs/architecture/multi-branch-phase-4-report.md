# Phase 4 — Multi-Branch Public Booking and Availability

**Date:** 2026-10-09  
**Project:** Zentra Appointment Booking System  
**DEV/TEST project:** `obpyyjewnsygkxobyunw` — Appointment Booking System  
**Environment status:** `ACTIVE_HEALTHY`, PostgreSQL 17.6  
**Migration:** `20261009100000_phase_4_branch_aware_public_booking`  
**Migration SHA-256:** `54A30EF7EE601A728AB7C9F872691F06D1A03A28C7811F4A31ADCF3219465BC3`

## Summary

Phase 4 adds the branch-aware public catalog, availability, and booking paths. The migration was applied to the named DEV/TEST project in one explicit PostgreSQL `BEGIN`/`COMMIT` transaction. Preflight assertions, schema/security/data postflight checks, and the single migration-history row were part of the same transaction. The remote migration inventory now lists Phase 4 exactly once after Phase 3.

The existing default branch and booking records were preserved. The second-branch activation gate remains enabled; the DEV/TEST project still has exactly one active, public, bookable default branch. No production project was accessed.

## Implementation

- Public landing and booking data now comes from a branch-eligible projection. It returns only branches meeting publication, booking, policy, hours, active-service, and assigned-staff requirements. The branch picker is omitted when only one eligible branch exists.
- A Playwright regression covers both picker states: one location opens booking directly, while multiple eligible locations show branch cards and preserve the selected branch and service in the booking URL.
- Service availability and booking resolve a branch by its public slug on the server. Branch service price, payment/deposit settings, Home Service fee, and travel buffers are applied from the effective branch configuration. Approval mode and business hours use the selected branch.
- Availability accounts for the selected branch timezone, its business hours and closures, staff assignments and schedules, global staff leave, existing appointments across branches, service buffers, and Home Service travel buffers and coverage radius.
- Home Service address, area, map pin, landmark, and instructions are validated server-side. Coordinates are used for coverage checks and remain private to the booking flow; they are not returned in the public availability response.
- Booking submission revalidates eligibility, service configuration, schedule, coverage, customer identity, and effective price in the database. It records the branch and immutable service, payment, location, and travel snapshots. The client does not choose a branch UUID or submit a trusted price.
- The public Next.js availability endpoint uses no-store behavior and sends Home Service coordinates in the POST body. The server-side Supabase service-role credential remains server-only. Public callers cannot execute the internal availability or booking submission functions; the service-role RPCs are restricted by database grants.
- Guest booking remains available for business-location appointments when enabled. Home Service continues to require an authenticated customer. Customer appointment and guest-access summaries now include the appointment’s actual branch name, public location/contact fields, and timezone.
- Existing approval, payment, appointment lifecycle, audit, guest-token, and notification-outbox behavior remains connected to the branch-specific booking snapshot.

## Database changes

The forward migration adds/replaces the public branch projection, branch-aware availability and booking RPCs, customer branch summaries, and guest appointment summary logic. It also updates appointment branch enforcement, lifecycle validation, and automatic acceptance logic to use the branch approval configuration.

The migration did not insert or activate branches, change existing booking rows, disable triggers, or modify payment records. It did not alter the Phase 1 activation guard. The remote migration history row stores the migration source and uses the existing `postgres` migration attribution convention.

## DEV/TEST live verification

Read-only checks after commit established:

| Check | Result |
|---|---|
| Project target | Exact ID `obpyyjewnsygkxobyunw`; PostgreSQL 17.6; active and healthy |
| Remote migration inventory | Phase 4 version `20261009100000` present exactly once; latest listed migration |
| Branches | 1 total, 1 active, 1 default, 1 public/bookable; original branch identity retained |
| Additional activation | None; `guard_branch_activation` remains enabled |
| Public branch projection | 1 branch, 3 services, 3 staff, and 6 business-hour rows returned |
| Availability calculation | Read-only calculation checked 14 days and returned 192 candidate slots over 12 days |
| Existing appointments | 3 appointments and 3 appointment items; all appointments have branch attribution |
| Existing payments | 1 payment; 0 orphaned payment relationships |
| Application triggers | 0 disabled triggers in the public schema; branch activation trigger enabled |
| RLS | RLS remains enabled on branches, appointments, appointment items, customers, and payments |
| Staff overlap | `appointments_no_staff_overlap` remains present and validated |
| RPC grants | Public catalog is executable by `anon` and `authenticated`; booking/availability submission RPCs are executable by `service_role` and denied to `anon` and `authenticated`; customer branch summary is authenticated-only; guest summary remains available to `anon`/`authenticated` |

Pre-migration and post-migration counts matched for the existing 3 appointments, 3 appointment items, and 1 payment. No remote booking write was used for verification.

## Validation results

| Check | Result |
|---|---|
| Lint | PASS |
| Typecheck | PASS |
| Unit tests | PASS — 147 tests across 28 files |
| Database suites | PASS — 722 checks total; Phase 1–4 multi-branch suite: 190 checks |
| Playwright E2E | PASS — 35/35 local browser scenarios |
| Production build | PASS — isolated output directory `.next-phase4-verification` |
| DEV/TEST migration and postflight | PASS — one explicit transaction; history row committed once with schema |

The local browser suite uses the repository’s Supabase stub. Its Realtime WebSocket endpoint returns 404, so E2E does not verify live Realtime transport. The database suite uses isolated PostgreSQL/PGlite fixtures and does not substitute for live role sessions.

## Remaining limitations

- The DEV/TEST project has no second active branch. The second-branch activation gate was deliberately kept closed, so live cross-branch booking and a visible multi-branch picker could not be exercised against a second branch.
- No live authenticated OWNER, ADMIN, STAFF, or CUSTOMER session was used for this phase. Role denials, identity checks, and booking behavior were covered by isolated database, unit, and E2E tests; the live database checks verified RPC grants and RLS metadata.
- A real booking submission was not performed against DEV/TEST. The live check exercised the public catalog and availability calculation without writing appointment data. Booking submission and lifecycle regressions were covered by the isolated database and browser tests.
- PayMongo remains a business-level provider integration. The database computes the selected branch’s effective amount and stores it in the immutable appointment/payment snapshot; branch-specific provider credentials are not implemented.
- Service duration and the service’s base before/after buffers remain shared catalog fields. Branch overrides cover price, payment/deposit configuration, Home Service fee, and travel buffers.
- No SMS delivery path was found in the existing notification implementation.
- Live Realtime delivery remains unverified; existing app refresh behavior still depends on the provider’s invalidation signals followed by authorized server refreshes.

No production database was modified. No users were created. No files were uploaded. No commit, push, or deployment was performed.

**PHASE 4 PASSED — READY FOR PHASE 5 REVIEW**
