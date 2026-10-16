# Multi-Branch Phase 1.1 Security Review

**Date:** 2026-10-07  
**Scope:** Phase 1 migration and the relevant existing authorization, booking, catalog, Storage, Realtime, and test paths  
**Migration state:** Local and unapplied to every remote database  
**Result:** Security corrections are implemented in the unapplied migration and covered by isolated tests.

## Review boundary and evidence labels

Reviewed `multi-branch-phase-1-report.md`, the complete Phase 1 migration, the Phase 0 architecture documents, and relevant preceding migrations including `authorization.sql`, `phase_6_5_authorization_hardening.sql`, `availability_engine.sql`, `phase_7_server_rate_limit_boundary.sql`, `phase8_booking_lifecycle.sql`, `app_realtime_refresh_signals.sql`, and the catalog/appearance Storage migrations. Reviewed their RLS policies, RPCs, triggers, grants, constraints, and database tests.

Only the unapplied Phase 1 migration and test/documentation files were changed. No earlier migration was changed. The migration was applied only to disposable local PGlite databases. No linked Supabase project was queried or modified; no migration, storage operation, account creation, deploy, stage, commit, or push was performed.

- **LIVE VERIFIED:** None for this review. No live Supabase or provider session was used.
- **ISOLATED E2E VERIFIED:** The local Playwright suite passed 34/34; this is not a live-user or remote-provider test.
- **DATABASE/RLS VERIFIED:** Local PGlite with the preceding migration chain, including populated backfill and a fresh-install/bootstrap database. It is not managed Supabase verification.
- **MANUAL OWNER VERIFIED:** None in this phase; no Owner session was used.

## Findings

### 1. P1 — Global staff leave exceeded the intended Admin authority

**Status:** Confirmed by policy/RPC review; corrected in the local Phase 1 migration.

**Evidence:** The pre-Phase-1 `staff_schedule_exceptions` insert, update, and delete policies authorized `private.is_admin()` for the whole table. Global `UNAVAILABLE` rows use a null branch and influence availability across branches, so a branch Admin could create or change leave beyond their assigned branch. The legacy `catalog_save_exception` RPC also represented unavailable leave globally.

**Fix:** Global exception read/write policies now require current OWNER authority with AAL2. Admin changes are branch-specific and require `can_admin_access_branch(branch_id)`. The legacy RPC preserves the single-branch workflow: OWNER leave remains global, while ADMIN leave is saved against the default branch. STAFF has no schedule write path.

**Regression tests:** `scripts/test-multi-branch-database.mjs` verifies that an Admin cannot read, insert, modify, or delete global leave; the Admin RPC creates branch-scoped leave; OWNER can create global leave; and STAFF cannot create schedule exceptions.

**Remaining limitation:** Phase 1 still permits only one active default branch. Before lifting that gate, later branch-aware RPCs must accept and validate an explicit branch rather than relying on the legacy default-branch operation.

### 2. P1 — Admin membership bootstrap and role changes needed a single explicit authority path

**Status:** Confirmed by trigger and authorization-path review; corrected in the local Phase 1 migration.

**Evidence:** Membership bootstrap was coupled to generic branch initialization and role changes. Trigger nesting was treated as an authorization exception, which made the safety of membership writes depend on how a trigger was reached. Conflict handling could also reactivate a revoked membership during an unrelated role write. A missing `auth.uid()` must not be interpreted as an authorized actor in service or migration contexts.

**Fix:** Runtime ADMIN role grants and revocations now pass through an OWNER+AAL2 guard. Membership changes are Owner-only; there is no `pg_trigger_depth()` bypass. The initial-business bootstrap seeds membership only when an authenticated Owner creates the business, and uses `ON CONFLICT DO NOTHING`. A new role grant does not silently restore an existing revoked membership. Revoking/demoting the ADMIN role revokes its memberships. Branch authorization still requires both the current ADMIN role and active membership; membership alone grants no role. Existing Admin backfill is explicit migration-time compatibility logic.

**Regression tests:** The isolated suite covers forged role insert/update, unauthorized membership insertion, null-`auth.uid()` role insert/update/delete and membership insert, Owner grant without MFA, membership revocation/reactivation, unrelated role regrant, explicit Owner regrant, and the separation between role and membership. A fresh-install fixture verifies that Owner bootstrap grants membership only to a previously Owner-authorized Admin.

**Remaining limitation:** Role grant/revoke and active membership management are not live-session verified. Remote execution paths still require a separate, approved migration review.

### 3. P1 — Public branch projections did not consistently require a published, bookable branch

**Status:** Confirmed by review of the public helper, direct RLS policies, and the SECURITY DEFINER website projection; corrected in the local Phase 1 migration.

**Evidence:** A public projection that trusts publication on the business row alone can return branch-bound services, staff, hours, or booking rules when the branch is hidden or booking is disabled. A SECURITY DEFINER projection must apply those checks itself because table RLS is not a reliable boundary inside that execution context.

**Fix:** `public.is_public_branch()` now requires an active, public-visible, booking-enabled branch. The boolean-only `has_public_default_branch()` gates business-wide public RLS. The SECURITY DEFINER website projection filters each branch-bound collection explicitly. Public availability returns no slots for an unpublished or disabled branch, and the appointment insert trigger rejects bookings that bypass the public booking path.

**Regression tests:** The isolated suite checks unpublished and disabled configurations against `public_website_data`, `public_catalog`, direct RLS reads, availability, Guest/Home Service submission, and direct service-role appointment insertion. It also checks that inactive branch-only catalog, staff, schedule, and policy rows do not leak through the default-branch public projections.

**Remaining limitation:** Public logo/catalog objects remain in the existing intentionally public marketing bucket. Hiding the business removes them from site projections but does not make an already-known public object URL private. Phase 1 adds no branch-owned Storage objects or Storage grants.

### 4. P2 — Opening-hours overlap constraint was not branch-local

**Status:** Confirmed in the Phase 1 constraint review and isolated branch fixture; corrected in the local migration.

**Evidence:** The existing `business_hours_no_overlap` exclusion used weekday and time range without a branch key. Hours in separate branches could therefore conflict, including while adding isolated branch-specific schedules.

**Fix:** The replacement exclusion includes `(branch_id, weekday, time range)`. The staff-hours exclusion is likewise branch-scoped. Appointment overlap remains global by staff and occupied time, as required for a shared staff member.

**Regression tests:** The database suite inserts overlapping opening intervals in different branches and rejects overlapping intervals within one branch. It also verifies a cross-branch appointment conflict remains blocked for the same staff member and time.

**Remaining limitation:** Booking still uses the one default branch. The global staff conflict rule should be revisited only if later phases permit the same staff member to work at different physical locations concurrently.

### 5. P2 — Legacy customer policies allowed arbitrary account linking and cross-branch edits

**Status:** Confirmed in the existing `customer_insert`/`customer_update` policies; corrected in the local Phase 1 migration.

**Evidence:** The insert policy allowed `private.is_admin()` to create a customer linked to any Auth account. The update policy also allowed any current Admin to update every customer row, without checking for activity in the Admin's assigned branch.

**Fix:** Authenticated customer creation is restricted to the active signed-in user's own Auth ID. Owner may manage any customer row. An Admin may update a profile only when the customer has an appointment in a branch currently assigned to that Admin. Customer reads continue to use the branch-aware helper.

**Regression tests:** The isolated suite verifies that a default-branch Admin cannot link an arbitrary Auth account or update a customer known only to another branch, while an explicitly assigned branch Admin can update a customer with activity in that branch.

**Remaining limitation:** Customer identity is intentionally business-wide. An Admin allowed to edit a shared customer profile through one assigned branch changes the shared contact record used across that customer's branch history. The database does not maintain per-branch copies of customer contact details.

### 6. P2 — Historical audit attribution backfill needed immutable-trigger handling

**Status:** Confirmed by populated migration execution; corrected in the local Phase 1 migration.

**Evidence:** Historical audit rows were not given the default-branch attribution, and the existing immutable-audit trigger prevented a migration-time update. The audit timestamp trigger would also change historical timestamps if left enabled.

**Fix:** The migration attributes legacy audit rows to the single historical default branch. It disables only the affected timestamp/immutability/audit triggers around the backfill and reenables them before continuing. Other security and booking triggers stay enabled.

**Regression tests:** The populated-database test compares the full audit rows before/after except for the new branch ID, verifies historical audit rows receive the default branch, and asserts all 16 intentionally suppressed triggers are enabled afterward.

**Remaining limitation:** A managed Supabase migration has not been applied or observed. The PGlite result confirms local SQL semantics only.

### 7. P2 — Availability helper EXECUTE hardening initially broke the protected Admin diagnostic RPC

**Status:** Confirmed by the isolated availability suite during this review; corrected in the local migration.

**Evidence:** Revoking authenticated EXECUTE from `private.calculate_availability()` prevented the existing `admin_availability_for_date()` invoker RPC from calling the helper, despite its internal Owner/Admin+AAL2 diagnostics check.

**Fix:** PUBLIC and anonymous execution remain revoked. Authenticated and service-role EXECUTE are granted because the authenticated diagnostics path performs its own role/MFA check and the helper returns only public availability when diagnostics are false.

**Regression tests:** `scripts/test-availability-database.mjs` exercises ordinary server availability, protected Admin diagnostics, invalid access, and schedule behavior. The full database suite replays the migration from a clean PGlite instance.

**Remaining limitation:** PostgREST exposure of the `private` schema and the exact managed-project function ACL should be confirmed during isolated remote migration review; this review did not inspect a live project.

## Additional migration and boundary checks

- **Backfill/FKs:** Existing appointments retain IDs, states, snapshots, and times; payment, refund, and guest-token rows remain unchanged and derive branch through the appointment. Composite foreign keys constrain branch/staff/policy/service relationships. Legacy business hours, schedules, closures, exceptions, and audit history are checked against pre-migration snapshots.
- **Triggers:** Migration suppression is limited to preservation-sensitive history triggers; they are restored before completion. Appointment booking, lifecycle, staff assignment, and membership guard triggers remain enabled. Branch reassignment, hard deletion, and invalid schedule/price relationships are rejected.
- **SECURITY DEFINER/EXECUTE:** Reviewed explicit empty `search_path`, caller guards, helper grants, public boolean helper grants, server-only booking/availability boundaries, and diagnostics checks. The availability helper grant correction is recorded above.
- **RLS:** Branch-bearing schedules, closures, policies, offerings, staff-service links, staff assignments, appointments, payments/refunds, exact Home Service destinations, and audit events have branch-aware predicates. Remaining business-wide Admin predicates apply to deliberately global business/catalog settings and are protected by the single-active-default-branch gate; Phase 1 does not enable a second active branch.
- **Appointment overlap:** The exclusion remains on `staff_id` and occupied interval, without branch ID, preventing double booking when staff is shared.
- **Realtime:** New branch tables emit payload-free invalidation hints only. Local tests use a shim and do not validate Supabase Broadcast delivery, channel policy, or cross-session refresh behavior.
- **Storage:** The migration adds no branch-owned bucket, object path, or Storage policy. Existing catalog/appearance policy tests remain in the database suite; PGlite does not test Storage HTTP behavior or a managed Storage service.

## Validation results

| Check | Result |
|---|---|
| Targeted Phase 1 database/RLS suite | PASS — 113 checks after Phase 1.1B identity and null-subject regressions |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 142 tests |
| `npm run test:db` | PASS — 645 checks (all database suites, including Phase 1.1B regressions) |
| `npm run test:e2e` | PASS — 34 tests |
| `npm run build` | PASS |

The Phase 1 migration remains unapplied to DEV/TEST and production. This report makes no live Supabase verification claim. Migration application and any multi-branch activation remain separate review/release actions.

**PHASE 1.1 PASSED — READY FOR ISOLATED MIGRATION REVIEW**
