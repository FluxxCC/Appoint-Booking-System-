# Multi-Branch Phase 1.1B — Customer Identity Integrity Review

**Review date:** 2026-10-07  
**Verdict:** PASS — the unapplied migration has the identity protections and regression coverage needed for isolated migration review.  
**Remote verification:** None. The Phase 1 migration remains unapplied to DEV/TEST and production.

## Scope and method

Reviewed the updated `supabase/migrations/20261007120000_multi_branch_phase_1_foundation.sql`, the customer grants and RLS from preceding migrations, all migration references to customer identity writes, customer registration and booking RPCs, SECURITY DEFINER routines, and customer-table triggers. The review also traced `private.guard_staff_assignment()` and the RLS/grants on `staff_branch_assignments`.

Validation ran against the disposable PGlite migration harness, not a live Supabase project. Existing application E2E checks use the configured local Supabase stub.

## Findings

### 1. P2 — Customer ownership needed a database-level immutable-link guard

**Status:** The direct client exploit was not confirmed. A defense-in-depth risk was confirmed: privileged database operations could change `customers.auth_user_id` because the original table had no identity-specific trigger. The existing ordinary-client grants already constrained this field.

**Evidence:**

- The preceding authorization migration grants customer UPDATE only on `display_name`, `email`, and `phone`; it does not grant UPDATE on `auth_user_id`. The new migration explicitly removes any table-level UPDATE and revokes UPDATE on identity/metadata columns before restating the three contact-field grants.
- The Phase 1 customer INSERT policy requires `auth_user_id = auth.uid()` and an active account. The UPDATE policy permits a customer’s own profile, the OWNER, or an ADMIN with an appointment in an assigned branch. Column privileges prevent those policies from being used to update the Auth UUID.
- `private.complete_customer_profile()` is SECURITY DEFINER, but requires the active caller and verified Auth email, inserts with `auth.uid()`, and on conflict updates only name/email/phone. It has no user-ID argument.
- The public booking SECURITY DEFINER RPC inserts guest customers with a NULL Auth UUID. For registered users it selects the row for `auth.uid()` and updates only contact fields. Other guest-access RPCs read customer identity data but do not link accounts.
- Before this review, the only pre-existing customer trigger was `touch_updated_at`; no ownership guard or transfer-audit trigger existed.

**Fix implemented:** The unapplied migration now adds `private.guard_customer_auth_linkage()` as a `BEFORE UPDATE OF auth_user_id` trigger. It rejects ownership changes even for service-role UPDATEs. It permits the existing `ON DELETE SET NULL` cleanup only when the former Auth row is absent, preserving historical customer and guest-booking records. No ownership-transfer RPC exists; transferring an account remains unsupported until a separately authorized and audited workflow is designed.

**Regression tests:** `scripts/test-multi-branch-database.mjs` verifies that CUSTOMER, STAFF, branch-authorized ADMIN, and `service_role` cannot change `auth_user_id`; CUSTOMER cannot INSERT or UPSERT a row linked to another user; authenticated UPDATE privileges exclude `auth_user_id`; ordinary customer and authorized Admin contact edits succeed; `complete_customer_profile()` remains bound to the caller’s UUID; and Auth-user deletion still leaves the customer record unlinked.

**Remaining limitations:** Direct superuser/DB-owner operations can disable triggers or change grants and remain trusted administrative capabilities. No legitimate account-ownership transfer workflow is available.

### 2. P2 — NULL-subject staff-assignment trigger logic was fail-open

**Status:** The trigger’s fail-open condition was confirmed in source. An unauthorized API path was not found under current table grants and RLS: `anon` has no write grant, authenticated INSERT/UPDATE policies are OWNER-only, and `service_role` is the intended bypass-RLS operational role. The trigger itself nevertheless treated any NULL `auth.uid()` as sufficient to skip its authorization check.

**Evidence:**

- Before the correction, the authorization condition only ran when `auth.uid() IS NOT NULL`.
- `staff_branch_assignments` grants authenticated users SELECT/INSERT/UPDATE, but its INSERT and UPDATE RLS policies require OWNER authority. STAFF cannot write assignments; ADMIN’s supported branch-default creation path operates with a non-NULL authenticated subject.
- `service_role` has explicit table privileges and bypasses RLS for trusted backend operations. The migration’s own service/DBA work also runs without an Auth subject.

**Fix implemented:** `private.guard_staff_assignment()` now fails closed for a NULL Auth subject unless the active database role is `service_role`, or the session is a direct trusted `postgres`/`supabase_admin` session with no role override. Authenticated OWNER/Admin behavior remains subject to the existing MFA and branch rules.

**Regression tests:** The database suite adds a temporary permissive policy only inside the disposable PGlite test database, then verifies an authenticated role with NULL `auth.uid()` still cannot update an assignment because the trigger rejects it. The policy is dropped immediately. A separate assertion confirms a `service_role` assignment maintenance write remains valid. Existing STAFF self-assignment denial also passes.

**Remaining limitations:** PGlite models the SQL/RLS behavior but does not replace a live PostgREST/JWT deployment check. No remote roles, policies, or migration state were inspected or changed in this phase.

## Verification results

| Check | Result |
|---|---|
| Targeted Phase 1 migration/RLS suite | PASS — 113 checks |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 142 tests across 27 files |
| `npm run test:db` | PASS — 645 database checks across all suites |
| `npm run test:e2e` | PASS — 34 tests using the local stub |
| `npm run build` | PASS |
| `git diff --check` | PASS; only existing Windows CRLF normalization warnings |

The initial sandboxed Vitest run failed to spawn a process (`EPERM`); the requested unit suite passed when rerun outside the sandbox. E2E output included expected local-stub Realtime WebSocket 404 and browser navigation-abort diagnostics; all 34 assertions passed.

## Change boundary and limitations

- Only the unapplied Phase 1 migration was modified for SQL behavior. No earlier applied migration was edited.
- Database tests were executed against disposable PGlite databases assembled from the migration history.
- No migration was applied remotely. No DEV/TEST or production database was queried or modified.
- No commit, push, or deployment was performed.

**PHASE 1.1B PASS — CUSTOMER IDENTITY AND NULL-SUBJECT ASSIGNMENT GUARDS VERIFIED LOCALLY**
