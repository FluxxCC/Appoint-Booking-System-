# Phase 3 — Multi-Branch Dashboard and Operational Integration

**Project:** Zentra Appointment Booking System  
**DEV/TEST project:** `obpyyjewnsygkxobyunw`  
**Migration:** `20261008170000_phase_3_branch_scoped_workspaces`  
**Status:** **PHASE 3 PASSED — READY FOR PHASE 4 REVIEW**

## Summary

OWNER, ADMIN, and STAFF workspaces now carry a server-validated branch scope through dashboard reads, appointment and calendar views, staff operations, catalog and schedule management, and availability diagnostics. OWNER can use an all-branch view or choose a branch. ADMIN and STAFF receive only the branches granted to them by RLS. A saved branch choice is a convenience; the server and database independently validate every request.

The Phase 3 forward migration was applied to the named DEV/TEST project in one explicit PostgreSQL transaction. The transaction included schema changes, live postflight checks, and exactly one migration-history row. Existing records were preserved. The second-branch activation gate remains in place; the project still has one active, public default branch.

## Implemented features

- Added the shared branch context resolver and workspace branch picker. The picker is hidden for single-branch users, supports OWNER all-branch view, and persists a selected branch in an HttpOnly, SameSite cookie. Stale or unauthorized selections fall back to the branches currently visible to the signed-in user.
- Added transaction-local branch context to branch-aware read RPCs and restrictive RLS policies. A branch ID supplied by a browser is never treated as authorization.
- Scoped ADMIN dashboard, appointment, calendar, customer-directory, payment, catalog, and report data to the selected branch or the ADMIN's assigned branches. Appointment results include branch labels and avoid duplicate appointment rows when an appointment has multiple service items.
- Scoped STAFF workspace appointments, schedule, availability, and operational summaries to assigned branches. Shared staff identity remains unchanged across assignments.
- Made appointment lifecycle authorization and schedule validation use the appointment's branch configuration. Global staff overlap prevention remains in force across branches.
- Routed branch-specific business hours, closures, staff service assignments, staff hours, and schedule exceptions through branch-authorized RPCs. Global staff leave remains an OWNER operation; branch ADMIN changes create branch-local exceptions.
- Made ADMIN availability diagnostics use the selected branch's timezone, services, hours, closures, staff assignments, exceptions, and occupied appointments.
- Added responsive branch indicators and selector behavior to the existing ADMIN and STAFF workspace shell without changing the broader design. Branch changes return users to their current workspace page.

## Routes and components

- Workspace shell and navigation: `src/components/layout/app-shell.tsx`, `src/components/layout/navigation.ts`, `src/components/layout/shell-nav.tsx`, `src/app/(admin)/admin/layout.tsx`, and `src/app/(staff)/staff/layout.tsx`.
- Branch selection and context: `src/features/branches/workspace-context.server.ts`, `src/features/branches/workspace-picker.tsx`, and `src/features/branches/workspace-actions.ts`.
- ADMIN operational views and writes: `src/features/admin/data.server.ts`, `src/features/admin/pages.tsx`, `src/features/admin/calendar.tsx`, `src/features/admin/actions.ts`, and `src/app/api/availability/route.ts`.
- STAFF and catalog views and writes: `src/features/catalog/data.server.ts`, `src/features/catalog/pages.tsx`, `src/features/catalog/staff-workspace.tsx`, and `src/features/catalog/actions.ts`.
- Forward database migration: `supabase/migrations/20261008170000_phase_3_branch_scoped_workspaces.sql`.

## Database and security boundaries

The Phase 3 migration adds branch-aware SECURITY INVOKER read and availability RPCs, branch context helpers, restrictive branch filters for operational tables, and branch-specific schedule/lifecycle validation. Existing policies still determine whether a user is an OWNER, an ADMIN with active branch membership and AAL2, or STAFF with an active branch assignment. Function grants allow the authenticated application roles to call authorized RPCs and deny anonymous calls to the ADMIN workspace RPC. The migration does not add a business-data superadmin or use service-role credentials in the browser.

The migration was applied through the connected Supabase MCP `execute_sql` tool as one explicit `BEGIN`/`COMMIT` batch. Its postflight checks ran before commit. The migration-history row was inserted in that same transaction after those checks passed. This follows the transaction path verified and documented during Phase 1.2; it does not rely on the undocumented transaction behavior of `apply_migration`.

No second branch was activated or published. Public catalog, public availability, and booking submission remain behind the existing single-active-default-branch gate. Phase 3 does not claim that public booking, payment, or notification workflows are ready for multiple bookable branches.

## Verification results

### Live DEV/TEST verification

Read-only post-migration checks against project `obpyyjewnsygkxobyunw` confirmed:

- Migration `20261008170000` appears exactly once in remote migration history.
- All five branch-aware workspace RPCs exist: ADMIN data, ADMIN customer directory, catalog, STAFF workspace, and ADMIN availability.
- `authenticated` can execute the ADMIN data RPC; `anon` cannot.
- RLS remains enabled on appointments, the global staff overlap constraint is present and validated, and no public application trigger is disabled.
- The default branch remains public. There is one branch, one active branch, one default branch, and zero active non-default branches.
- Before/after counts match: 3 staff, 3 services, 3 appointments, 3 appointment items, 1 payment, 21 customers, 11 guest tokens, 6 staff-service links, 6 business-hour rows, 18 staff-hour rows, 3 staff assignments, 0 ADMIN memberships, and 99 audit rows. Closures and schedule exceptions remain at 0.

These checks establish the committed schema and data state. They do not establish behavior under a live signed-in OWNER, ADMIN, STAFF, or CUSTOMER session.

### Isolated tests and local checks

| Check | Result |
|---|---|
| Lint | PASS |
| Typecheck | PASS |
| Unit and integration tests | PASS — 146 tests across 28 files |
| Full database harness | PASS — 714 checks across all suites |
| Phase 3 branch authorization and operations | PASS — 182 isolated database checks |
| Production build | PASS |
| Playwright E2E | PASS — 34/34 local browser scenarios |

The isolated database suite exercises OWNER all-branch and selected-branch views, assigned and unassigned ADMIN/STAFF scope, single-branch behavior, branch filtering, appointment lifecycle, and global staff overlap. Its Auth claims use a test shim. The browser suite uses the local Supabase stub; the stub returned 404 for Realtime WebSocket handshakes, so those runs do not verify live Realtime delivery.

## Remaining limitations and Phase 4 readiness

- No real authenticated OWNER, ADMIN, or STAFF session was available for this verification. No accounts or credentials were created or requested. Live role-specific UI and MFA flows remain unverified.
- The DEV/TEST project has no second active branch, so cross-branch workflows were verified with isolated database fixtures rather than real second-branch records.
- Realtime remains an empty invalidation signal followed by a server refresh and authorization check. Live socket delivery was not tested. The local E2E stub does not implement the Realtime WebSocket endpoint.
- Branch-selected daily views use that branch's timezone. All-branch daily summaries use the business timezone as their common reporting day. If the business needs local-day aggregation for branches in different timezones, that reporting definition should be agreed and implemented before relying on those comparisons.
- Public booking, availability, payments, and notifications remain intentionally single-branch until their branch-aware end-to-end paths are implemented and verified. Keep the second-branch activation gate closed through Phase 4 review.

Phase 3 is ready for Phase 4 review. Phase 4 should cover branch selection through public booking, payment, customer notifications, and live Realtime behavior before any additional branch becomes bookable.

No production project was accessed. No database reset, deployment, commit, or push was performed.

**PHASE 3 PASSED — READY FOR PHASE 4 REVIEW**
