# Multi-Branch Phase 1 Report

**Date:** 2026-10-07  
**Phase:** Database foundation, authorization, and single-branch compatibility  
**Status:** IMPLEMENTED LOCALLY — PHASE 1.1 SECURITY REVIEW PASSED — READY FOR ISOLATED MIGRATION REVIEW  
**Repository:** `main` at `3d2c11e` when work began

Status labels: **IMPLEMENTED** means present in the local worktree; **VERIFIED IN ISOLATED TESTS** means exercised in the local PGlite/E2E harness; **NOT LIVE VERIFIED** means not exercised against a managed Supabase project; **BLOCKED** means live application/session verification is withheld pending the explicit approval required by the brief.

## 1. Repository and architecture review

The approved Phase 0 audit and implementation plan were read before implementation. Their description still matches the repository: one dedicated application and Supabase project per client, one business-wide customer identity, and a single implicit operating location. Before Phase 1, there were no branch, membership, assignment, or branch-attribution tables. No material architecture drift was found.

The worktree already contained uncommitted Phase 0 architecture documents, security documentation, and a `next-env.d.ts` change. Those files were not intentionally edited as part of Phase 1. The Next.js build regenerated its normal type/config files; the final status is recorded below. No files were staged, and no commit, push, deployment, remote migration, or second-branch activation was performed.

## 2. Database changes — IMPLEMENTED

Added the forward-only migration:

`supabase/migrations/20261007120000_multi_branch_phase_1_foundation.sql`

It creates:

- `branches`, with unique slugs, active/public/booking flags, address/contact, IANA timezone, Home Service origin/coverage, and timestamps. Branch deletion is rejected; Phase 1 permits only one active default branch.
- `branch_booking_settings` for branch approval mode.
- `branch_services` for branch eligibility and validated optional price, payment, deposit, Home Service fee, and travel overrides.
- `admin_branch_memberships` and `staff_branch_assignments`, with actor/time, active/revoked state, uniqueness, protected history, and foreign keys.

It adds branch attribution to booking-policy versions, service eligibility, business hours and closures, staff hours and exceptions, appointments, and audit rows. Composite foreign keys tie an appointment to a branch’s staff assignment and policy version, and tie staff-service eligibility to both the branch assignment and branch offering. Existing appointment/payment/refund columns are not rewritten with a duplicated payment branch value.

The default branch inherits the existing business address, contact details, timezone, Home Service origin/radius, and approval mode. Existing services, staff, Admins, schedules, hours, closures, policies, and appointments are attributed to that branch. Existing `UNAVAILABLE` staff exceptions become explicit global leave; extra hours remain branch-scoped. OWNER may continue to create global leave. The legacy exception RPC saves ADMIN leave only for the default branch, and the exception policies restrict global leave read/write to OWNER.

The backfill is guarded: it reuses the existing default branch, refuses to invent a default when a conflicting branch already exists, and stops if operational rows exist without business settings. Fresh installations create the default branch when their first business settings row is inserted. Migration-time trigger suppression is narrowly limited to the backfill so immutable policy history, audit records, and historical `updated_at` values stay unchanged; the protections are restored before the migration continues. Legacy audit rows are attributed to the default branch.

## 3. Authorization and data boundaries — IMPLEMENTED

- **OWNER:** current OWNER with existing AAL2/MFA retains cross-branch access through database authorization helpers; OWNER does not need a membership row.
- **ADMIN:** access requires a current ADMIN role, active profile, AAL2, and a current active membership for the exact branch. Existing Admins are imported to the only/default branch to preserve the prior single-location authorization decision. Membership alone never grants ADMIN role.
- **STAFF:** access requires a current STAFF role, active linked staff profile, active assignment to the target branch, and existing appointment-level authorization. STAFF receives no payment/report authority and cannot self-assign.
- **CUSTOMER/GUEST/ANON:** existing customer-owned and appointment-token rules remain in force; public access uses boolean-safe catalog filters rather than direct branch-table access.

Branch-aware RLS, grants, and private helpers cover branch settings, offerings, assignments, schedules, policies, appointments, payments/refunds through their appointment relationship, audit rows, and exact Home Service destinations through their parent appointment. Membership and assignment revocation is read live by the helpers. Staff assignment revocation or deactivation is rejected when unresolved future appointments remain. Membership/assignment rows cannot be deleted.

Payload-free app/public invalidation triggers were added for the new branch tables. No branch identifiers, customer data, payment facts, or Home Service coordinates were added to Realtime payloads. Storage authorization was not broadened because Phase 1 adds no branch-owned assets; existing logo/catalog image policy remains global to the dedicated business.

## 4. Booking, payments, and backward compatibility — IMPLEMENTED

Legacy booking, schedule, catalog, and availability paths resolve through the single active default branch. Database triggers reject a non-default appointment and reject an appointment without an active staff assignment; appointment items must match an active branch offering and staff-service link. Existing payment settlement, refunds, and Home Service private-address storage remain linked through the appointment.

The existing `appointments_no_staff_overlap` exclusion remains keyed by `staff_id` and `occupied_range`; branch ID was not added to it. Existing schedule locking and lifecycle RPCs remain in place. The new branch-specific pricing/configuration tables are foundations only: existing booking/public pricing continues to use the existing business-wide values while only the default branch is active.

No branch selector, public multi-branch booking, owner branch-management UI, or branch workspace UI was added. A second active branch is explicitly blocked until later phases update all legacy app and trusted server operations.

## 5. Generated types and tests — IMPLEMENTED / VERIFIED IN ISOLATED TESTS

Updated migration-derived database types for the new tables/columns. The type generator now handles PostgreSQL array arguments and table-return RPC signatures without replacing their existing row types with incorrect scalar types. Extended the PGlite migration harness to stop before a selected migration, added the Phase 1 database suite to `test:db`, and updated the RLS table-count assertion.

The Phase 1 suite now passes **113 checks** against a populated database assembled from the preceding migrations and a fresh-install bootstrap database. It verifies default-branch backfill; appointment, snapshot, policy, payment, refund, guest-token, timestamps, and audit preservation; timezone and override validation; owner/Admin/staff scope; MFA and immediate role/membership revocation; cross-branch customer/payment/Home Service row filters; customer identity tampering and immutable ownership; the NULL-subject staff-assignment guard; staff reassignment protection; anonymous denial; public visibility and booking-disabled behavior; global leave restrictions; the single-active-branch gate; the default-only appointment trigger; and global staff/time overlap enforcement. See [the Phase 1.1B Customer Identity Review](multi-branch-phase-1-1b-review.md) for the latest regression evidence and limits.

Full local verification results:

| Check | Result |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 142 tests |
| `npm run test:db` | PASS — 645 checks (532 existing + 113 Phase 1.1/1.1B) |
| `npm run test:e2e` | PASS — 34 tests |
| `npm run build` | PASS |

The E2E suite used its configured local stub on port 54322 and app server on port 3100, not the linked DEV/TEST project. The stub logs expected Realtime WebSocket 404s and navigation-abort diagnostics; all 34 browser assertions passed. The build and E2E commands added the generated `.next-e2e-production` type paths to `tsconfig.json`.

## 6. Migration validation — NOT LIVE VERIFIED

The full migration chain, including this forward-only migration, was applied to isolated PGlite databases. One database was populated with pre-migration business, schedule, appointment, payment, refund, and guest-token data before Phase 1 was applied. All assertions passed. This confirms local SQL behavior in the isolated harness; it is not a managed Supabase application test.

The linked DEV/TEST project and any production project were not changed or queried during this phase. Remote migration identity/history, backups, row counts, RLS behavior, real OWNER/Admin/Staff sessions, webhooks, Storage, and provider Realtime behavior therefore remain **NOT LIVE VERIFIED**. Live application of a migration requires a separate release review, identity/history confirmation, backup/snapshot, and pre/post migration row-count and constraint review.

## 7. Known limitations and risks requiring review

1. The database deliberately blocks a second active branch. Do not lift that guard until branch-aware public booking, appointment acquisition/transition, admin aggregation/follow-up reads, privileged server operations, payment/refund reporting, notifications, and branch-selection UX are implemented and reviewed.
2. `business_settings` remains the operational source for the one active default branch; changes are mirrored to its branch configuration. Branch price/payment/coverage overrides are schema-only until later booking/public projections consume them.
3. Existing Admins receive an initial default-branch membership during migration. Review this compatibility assumption before rollout if any existing Admin should lose access.
4. The new security assertions are isolated SQL/RLS tests, not live sessions against Supabase. The report makes no claim of live Admin or Staff verification.
5. Branch management, assignment controls, customer branch choice, nearest-branch Home Service routing, and branch-scoped notification counts are later-phase work.

## 8. Files changed and Git status

Phase 1 files: the new migration, this report, `scripts/test-multi-branch-database.mjs`, `scripts/database-harness.mjs`, `scripts/test-database.mjs`, `package.json`, `scripts/generate-foundation-types.mjs`, `src/types/database.generated.ts`, and the Next-generated `tsconfig.json` include paths.

At report time: branch `main`, HEAD `3d2c11e`; no staged changes. The already-present untracked Phase 0 documents and `docs/security/` were preserved. No live Auth users were created, and no commit, push, deploy, remote database operation, or migration application was performed. Synthetic identities used by the security checks existed only inside disposable PGlite databases.

**Actions requiring approval:** applying this migration to DEV/TEST or production, or enabling any second active branch. Both are intentionally outside this phase.
