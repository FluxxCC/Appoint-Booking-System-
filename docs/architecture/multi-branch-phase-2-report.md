# Multi-Branch Phase 2 — OWNER Branch Management

**Date:** 2026-10-08  
**Target:** Appointment Booking System DEV/TEST, Supabase project `obpyyjewnsygkxobyunw`  
**Production:** Not modified  
**Git/deployment:** No commit, push, or deployment performed

## Outcome

Implemented and deployed the OWNER-facing branch setup workspace. OWNERs can create draft locations, edit branch details and configuration, manage branch service offerings, assign existing ADMIN accounts, and assign existing STAFF profiles to multiple branches. The current default branch and single-location booking path remain intact.

The requested second-branch activation/deactivation and booking controls are deliberately held behind the existing Phase 1 compatibility boundary. The architecture plan says additional branches may be activated only after branch-aware booking, availability, dashboards and operational workspaces are released. Those paths are not part of this OWNER-management phase. Therefore the OWNER module is usable for draft setup, but Phase 2 does not yet satisfy the requested ability to activate/deactivate a second branch.

**PHASE 2 BLOCKED — CORRECTIONS REQUIRED**

## Implemented features

- Added the OWNER-only `/admin/branches` route and navigation entry.
- Added draft branch creation and editing for name, URL slug, address, contact email/phone, timezone, public visibility, Home Service origin/radius, and branch approval mode.
- Added branch service offering controls and optional currency-aware price overrides using `branch_services`.
- Added OWNER-controlled branch membership management for accounts that already have the ADMIN role. Membership assignment never creates or grants an ADMIN role.
- Added OWNER-controlled STAFF assignment and removal. One staff profile remains shared across branches; the existing database guard preserves assignment history and blocks removal when future appointments need resolution.
- Kept the branch page selector-free. The current single branch is displayed directly.
- Reused the existing payload-free Realtime invalidation triggers and route revalidation after successful changes.
- Kept the default branch’s address, contact details, timezone and booking publication linked to Business Settings so legacy single-branch operations remain authoritative.

## Database changes

Applied one migration to the specified DEV/TEST project:

`supabase/migrations/20261008130707_owner_branch_management.sql`

The Supabase migration runner recorded version `20261008130707` once as `owner_branch_management`. The migration:

- Adds `public.owner_save_branch(...)`, a SECURITY DEFINER RPC with an empty `search_path`.
- Checks the live caller identity and `private.is_owner()`, which requires the existing active OWNER role and AAL2.
- Exposes RPC execution to `authenticated` only; `anon` and `service_role` do not have EXECUTE permission.
- Uses an expected `updated_at` value to reject stale edits.
- Adds an audit trigger for branch creation and updates.
- Requires newly created branches to remain inactive and not bookable. It rejects activation or booking for additional branches until Phase 3.
- Preserves RLS on all five branch foundation tables and retains the Phase 1 membership, assignment and service-price guards.

No existing business or appointment rows were intentionally updated. The post-migration counts remain: one branch, one active default branch, three branch service offerings, zero active ADMIN memberships, and three active STAFF assignments.

## UI and authorization boundaries

| Area | Implementation |
| --- | --- |
| Route | `src/app/(admin)/admin/branches/page.tsx` |
| UI | `src/features/branches/panel.tsx` |
| Server reads | `src/features/branches/data.server.ts` |
| Server mutations | `src/features/branches/actions.ts` |
| Database migration | `supabase/migrations/20261008130707_owner_branch_management.sql` |
| Navigation | `src/components/layout/navigation.ts`, `src/components/layout/shell-nav.tsx` |

The page and every server action call `requireOwner()`. Branch writes also pass through the database OWNER/AAL2 RPC. ADMIN memberships and STAFF assignments use the existing authenticated Supabase client, RLS policies and database trigger checks; no service-role client or browser secret is used. Membership does not grant a role, and assignment never changes staff identity.

## Verification

| Check | Result |
| --- | --- |
| Lint | PASS |
| Typecheck | PASS |
| Unit tests | PASS — 142 tests across 27 files |
| Database tests | PASS — 660 checks across all suites, including 128 Phase 1/2 multi-branch checks |
| Production build | PASS |
| DEV/TEST migration history | Phase 1 once; Phase 2 once |
| DEV/TEST RPC security | SECURITY DEFINER, empty search path, authenticated EXECUTE only; anon/service_role denied |
| DEV/TEST RLS/triggers | RLS remains enabled on all five branch tables; branch audit trigger enabled |
| DEV/TEST data compatibility | One active default branch remains; existing three STAFF assignments and three service offerings remain |
| Real OWNER/Admin/Staff session | Not exercised; no live credentials or sessions were used |

The first sandboxed unit and build attempts encountered Windows `spawn EPERM`. Both commands passed when rerun through the approved local process path. The focused Phase 2 database suite passed after adding authorization, single-branch and activation-gate regressions.

## Security regression coverage

The database suite verifies:

- OWNER branch creation/editing requires AAL2.
- ADMIN, STAFF, CUSTOMER and anonymous callers cannot use the OWNER branch RPC.
- The RPC is executable by authenticated callers only; its internal OWNER/AAL2 check remains authoritative.
- An additional branch cannot be activated or made bookable during this phase.
- A visible-but-inactive draft remains absent from public branch projections.
- The existing single-active-default invariant stays true after draft creation.
- Existing membership insert, revocation, reactivation, role-removal and ADMIN self-grant denial tests continue to pass.
- OWNER staff assignment and removal preserve one staff profile; non-owner self-assignment remains denied.
- Global staff/time overlap enforcement and the existing booking compatibility checks continue to pass.

## Remaining limitations and Phase 3 prerequisites

1. **Branch activation and deactivation:** Additional branches remain inactive. The default branch remains active and cannot be deactivated under the Phase 1 invariant. This is the unmet Phase 2 requirement that blocks a PASS verdict.
2. **Branch booking:** Additional-branch booking remains disabled. Service offerings, approval mode and visibility are stored for setup but are not consumed by the current public booking wizard or availability RPCs.
3. **Branch operations:** Before activation, Phase 3 must scope public catalog and booking, availability, appointment acquisition and lifecycle, Admin aggregation/follow-up reads, Staff workspace/schedules, payment/refund/report attribution, notifications and any branch selector to the selected branch.
4. **Default configuration:** Address, contact, timezone, Home Service coverage and booking publication for the default branch continue to be edited through Business Settings.
5. **Live-session evidence:** The live database migration, ACLs, RLS flags, trigger state, branch counts and migration history were checked. Real OWNER AAL2 and ADMIN/STAFF session flows were not tested.

Do not lift the additional-branch activation gate until Phase 3 branch-aware application operations and their authorization regressions are complete.

**PHASE 2 BLOCKED — CORRECTIONS REQUIRED**
