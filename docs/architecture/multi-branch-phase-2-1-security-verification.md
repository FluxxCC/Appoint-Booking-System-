# Phase 2.1 — OWNER Branch Management Security Verification

**Date:** 2026-10-08  
**Project:** Zentra Appointment Booking System  
**DEV/TEST project:** `obpyyjewnsygkxobyunw` (`Appointment Booking System`)  
**Production:** Not accessed or modified

## Verdict

**PHASE 2.1 PASSED — READY FOR PHASE 3**

The OWNER branch-management route, Server Actions, branch RPC, RLS policies, and assignment guards enforce the intended OWNER boundary. Regression checks cover the requested role denials and setup flows. The additional-branch activation and booking gate remains in place. No confirmed Phase 2.1 security defect remains.

Real OWNER, ADMIN, STAFF, CUSTOMER, and anonymous Auth sessions were not used for live PostgREST or browser mutation attempts. No authenticated tab was available through the browser inspection surface, and no test credentials or MFA enrollment were supplied. The real-session behaviors listed below remain unverified; the tests described as isolated use a local PostgreSQL-compatible harness and an Auth-claim shim, not live Supabase sessions.

## Scope reviewed

- `docs/architecture/multi-branch-implementation-plan.md`
- `docs/architecture/multi-branch-phase-2-report.md`
- `supabase/migrations/20261008130707_owner_branch_management.sql`
- Phase 1 RLS, grant, policy, trigger, public-projection, and booking code in `supabase/migrations/20261007120000_multi_branch_phase_1_foundation.sql`
- `/admin/branches`, the OWNER branch data loader, Server Actions, and branch management UI in `src/app/(admin)/admin/branches/` and `src/features/branches/`
- Existing auth guards and the branch database regression harness

The Phase 2 migration was already applied. This verification did not reapply it, create another migration, or change any remote database object or row.

## Authorization findings

| Surface | Evidence and result |
| --- | --- |
| OWNER page and reads | `/admin/branches` and `readOwnerBranches()` each call `requireOwner()`. The shared admin layout separately requires an authenticated admin and AAL2; the OWNER check rejects ADMIN, STAFF, CUSTOMER, and anonymous principals. |
| Server Actions | All four exported mutations call `requireOwner()` before parsing untrusted form data or issuing a database request. The new integration regression confirms denied calls stop before `rpc()` or `from()`. |
| Branch details RPC | `owner_save_branch(uuid,timestamptz,jsonb)` checks non-null `auth.uid()` and `private.is_owner()`. The existing helper checks an active profile, current OWNER role, and AAL2. The RPC has an empty `search_path`; execute is granted to `authenticated`, not `anon` or `service_role`. |
| ADMIN membership writes | The branch membership INSERT/UPDATE policies require OWNER. The database trigger checks OWNER/AAL2, requires an existing ADMIN role for an active membership, records grant/revocation, and retains the row. Isolated tests deny ADMIN self-insert and self-update, and allow OWNER grant/revoke. |
| STAFF assignment writes | The staff assignment INSERT/UPDATE policies require OWNER. Its trigger denies staff self-assignment and self-update, preserves assignment identity/history, requires an active staff profile, and prevents removal while future appointments need resolution. Isolated tests exercise OWNER assignment, revocation, reactivation, and STAFF denial. |
| Branch and service configuration | Branch creation/editing uses the guarded OWNER RPC. Branch services are branch-scoped by RLS; the OWNER path successfully creates an offering and price override in the isolated suite. Existing assigned-ADMIN operational policies remain branch-scoped and do not grant branch creation or membership management. |
| Sensitive errors | Unexpected branch-save and branch-read database errors are returned as generic user-safe messages. The RPC returns only its static, user-facing `55000` activation/setup messages. Isolated regressions check that internal database details are not serialized to callers. |

## Branch and booking verification

### Live DEV/TEST metadata and public projection

Read-only checks against the exact project ID confirmed:

- Migration version `20261008130707` appears exactly once in remote migration history.
- One branch exists; it is the sole active default branch.
- No non-default branch is active, public, or bookable.
- The default branch currently passes `is_public_branch()` and the public catalog returns three offerings.
- All five branch tables have RLS enabled.
- Membership and staff assignment guards, service override guard, branch activation/delete guards, branch audit, update timestamp, and application invalidation triggers are present and enabled.
- Phase 2 currently has zero active ADMIN memberships, three active STAFF assignments, and three active default-branch service offerings. No data was changed.
- The branch RPC is SECURITY DEFINER with an empty search path. `authenticated` can execute it so the OWNER application can call it; `anon` and `service_role` cannot.

Live SQL checks were read-only. The server availability wrapper requires `service_role`, and the available SQL inspection context is not `service_role`; the wrapper correctly rejected that direct inspection call. No service-role bypass or live booking write was attempted. A live customer booking or authenticated role mutation was not performed.

### Isolated database authorization and workflow checks

The local PGlite suite applies the migrations in an isolated database and uses a test-only `auth.uid()`/`auth.jwt()` shim. It now passes **151 Phase 1/2 multi-branch checks**, including:

- OWNER AAL2 required; ADMIN, STAFF, CUSTOMER, and anonymous denials for branch creation/edit RPCs.
- Draft branch creation, contact/location/timezone/Home Service configuration, branch-specific approval mode, stale-write rejection, and safe staged public visibility.
- Rejection of additional-branch activation and booking, with the gate unchanged.
- OWNER branch-service configuration and price override, ADMIN self-membership denial, and OWNER membership grant/revocation.
- OWNER staff assignment and revocation; STAFF cannot create, change, or delete its own assignment.
- Inactive branch-only offerings omitted from public catalog/availability and rejected by public booking submission.
- The default branch remains public and accepts a normal guest booking after the migration.
- Existing global staff/time overlap enforcement and single-active-default compatibility.

The new `tests/integration/branch-management-access.test.ts` adds four local regressions for page/read/action guard ordering, authenticated-session RPC use, and generic database-error responses.

## Validation results

| Check | Result |
| --- | --- |
| Lint | PASS |
| Typecheck | PASS |
| Unit and integration tests | PASS — 146 tests across 28 files |
| Full database suite | PASS — 683 checks across all database harness scripts; 151 multi-branch checks |
| Production build | PASS — `/admin/branches` included |
| Remote migration history | Phase 2 version present exactly once |
| Remote schema and branch state | RLS/triggers verified; only the active default branch is active/public/bookable |
| Real Supabase Auth sessions | Not verified; no live authenticated browser tab or test credentials/MFA session was available |
| Playwright E2E against real Supabase | Not run; the repository E2E configuration uses a local Supabase stub and does not provide real role sessions |

## Supabase security advisor notes

The project security advisor also reported existing informational RLS-without-policy notices for restricted internal/event tables and warnings for exposed SECURITY DEFINER helper functions. `owner_save_branch` is among the warnings because authenticated users need EXECUTE permission to reach the OWNER UI; the function contains the OWNER/AAL2 check described above, and the isolated negative tests verify denial. Public branch helper RPCs return limited visibility booleans used by public projections. These notices were reviewed and left unchanged because no Phase 2.1 privilege escalation was found. The advisor also reports leaked-password protection disabled; that project-wide Auth setting is outside this branch-management verification and was not changed.

## Remaining verification limitations and next phase

1. Real-session route and direct PostgREST denials for OWNER, ADMIN, STAFF, CUSTOMER, and anonymous users still need a controlled authenticated test environment with authorized accounts and MFA. No credentials were requested or used.
2. The live service-role-only availability and booking boundary was not invoked. The isolated database suite verified default and inactive-branch booking behavior instead.
3. Additional-branch activation remains intentionally disabled. Phase 3 must complete branch-aware public booking/availability, admin workspaces, staff schedules/workspaces, appointment and payment operations, and their authorization checks before anyone lifts the activation gate.

No second branch was enabled. No remote migration or data change, production action, commit, push, or deployment occurred.

**PHASE 2.1 PASSED — READY FOR PHASE 3**
