# Multi-Branch Implementation Plan

**Status:** Proposed for implementation review; no application or database implementation has started.
**Prepared:** 2026-10-07
**Companion audit:** docs/architecture/multi-branch-architecture-audit.md

## 1. Architecture decision

Use one dedicated application and database per client business, with multiple branches represented as rows and membership relations inside that client’s database:

**One client business → one Vercel application/deployment → one Supabase project/database/Auth/Storage → many branches.**

Do not add a tenant discriminator, shared client/business registry, cross-client query path, SaaS billing, or self-service business registration. Branch IDs are only local to one client database and are never a substitute for client isolation.

Use PostgreSQL as the authority for branch membership, appointment branch attribution, schedule conflicts, booking snapshots, and financial attribution. A selected branch in a URL or control is context only. The server and RLS must independently confirm the signed-in actor can access that branch.

## 2. Proposed data model

Keep the existing global business and customer identities. Add branch-scoped operational data and authoritative foreign-key relationships.

| Proposed entity/change | Purpose and key fields | Notes |
| --- | --- | --- |
| branches | id, name, slug, active status, public visibility/booking status, address, contact details, IANA timezone, service origin coordinates, Home Service coverage radius, timestamps | No client/business foreign key is needed inside this database. Use soft deactivation. Keep one active default branch after migration. Public projections expose only active and intentionally public fields. |
| branch_booking_settings | branch_id, approval mode, any branch-specific booking controls, updated_at | Keeps branch approval behavior explicit instead of continuing to treat the single business_settings value as authoritative for every location. Decide which registration/guest controls remain global. |
| booking_policy_versions | Add a non-null branch_id and enforce uniqueness per branch/version after backfill. | Retain append-only immutability. Every appointment points to the exact branch policy version in effect when it was requested. |
| branch_services | branch_id, service_id, active/published, optional price override, optional payment/deposit overrides, optional Home Service fee/travel overrides | One row determines whether a shared service is offered at a branch and its effective commercial terms. Validate deposit/payment bounds against the effective price. |
| admin_branch_memberships | auth_user_id, branch_id, active, granted_by, granted_at, revoked_at | A separate assignment, not a role. Only an OWNER-only database operation can grant/revoke it. Retain revoked rows for audit and reactivation. |
| staff_branch_assignments | staff_id, branch_id, active, assigned_by, assigned_at, revoked_at | Staff keep one global identity/profile and may have multiple branch assignments. Retain the assignment row after revocation for historical appointment integrity. |
| staff_services | Add branch_id and replace global staff/service uniqueness with branch-scoped uniqueness, or introduce an equivalent explicit branch staff-service relation. | The final migration choice should preserve the current catalog while making service eligibility unambiguously branch-specific. Enforce FKs to an active assignment and branch offering for new bookings. |
| business_hours and business_closures | Add branch_id; make weekly uniqueness branch-local. | Existing hours/closures are copied to the default branch. Owner bulk actions may copy hours/closures to another branch, but independent branch schedules remain authoritative. |
| staff_working_hours | Add branch_id and an FK to the staff/branch assignment. | Schedule rows are local wall-clock times interpreted in that branch’s timezone. |
| staff_schedule_exceptions | Add branch_id for branch-specific changes; represent global staff leave explicitly. | Global leave should block all assigned branch schedules. A branch-specific exception affects only that assignment. Do not make NULL scope mean “all branches” without an explicit policy and tests. |
| appointments | Add immutable, non-null branch_id after backfill; add timezone_snapshot if historical local-time display must survive branch timezone changes. | Validate that the staff member is assigned to the branch and that the service was offered there at request/acceptance time. Preserve existing UTC instants and all booking/payment snapshots. |
| appointment_items | Add branch-aware relationship enforcement if required by the chosen composite-FK design. | Continue to use immutable service, price, duration, and buffer snapshots. Do not trust browser-submitted effective prices. |
| payments/refunds | No duplicate branch column by default. | Derive branch from payment → appointment. Only denormalize if a measured query need justifies it, with an immutable FK/trigger and no conflicting source of truth. |
| customers | No branch_id. | Keep one registered customer account per client business. Branch customer lists are derived from branch appointments. A customer’s cross-branch history remains private from an ADMIN who lacks the other branch assignment. |
| audit_logs | Add branch attribution only when an event targets a branch or branch-owned resource. | Preserve actor, entity, and immutable audit facts. Never infer financial or security attribution from a client-supplied branch value. |
| notification_outbox and delivery receipts | Appointment notifications derive branch through appointment; branch-only notifications may carry branch_id. | Keep provider delivery payloads and recipient selection server-only. Scope badge counts through current branch membership. |
| Storage objects | Add branch-specific object prefixes and checks only for branch-specific assets. | Keep global logo/hero and shared marketing assets business-wide. Resolve object ownership through a database resource and membership check; a path alone is not an authorization grant. |

### Relationship and constraint rules

1. A branch has many service offerings, weekly hours, closures, booking policies, staff assignments, appointments, and reports.
2. Staff can have many branch assignments. A staff-service eligibility row must belong to both an assignment and an offering at the same branch.
3. Every new appointment has exactly one branch and one assigned staff member. Its staff assignment, service offering, and policy version must all match that branch.
4. A payment belongs to its appointment. Reports attribute the payment through that relationship.
5. A registered customer remains a business-wide identity. Never merge or claim a guest record solely because its email or phone matches an account.
6. Keep appointments_no_staff_overlap global to staff and occupied time. A staff member cannot be reserved at two branches at overlapping times.
7. Branches, memberships, and schedule records should be soft-deactivated or retained. Historical appointment, payment, refund, guest-token, and audit relationships must not cascade-delete.
8. Add composite foreign keys where they provide real integrity, such as appointment branch plus staff assignment and policy version. Where branch_id would be duplicated in a child table solely to support such an FK, document why the duplicated value is integrity-checked and immutable.
9. Add query indexes from measured access patterns: branch/status/start time for appointments, branch/customer/start time, branch/service/active, assignment by user and branch, and branch-local hours/exceptions. Retain existing staff/time GiST conflict enforcement and verify query plans.

### Global versus branch-level configuration

Keep the business name, logo, domain, global brand/theme, customer registration policy, and one client-level PayMongo integration global unless Zentra approves a separate product scope.

Treat location address, public contact details, timezone, opening hours, closures, branch activation, service availability, service price/payment overrides, booking approval mode, booking policy versions, and Home Service coverage as branch-specific. Keep one client-level currency in the first release; reports remain separated by currency if that policy ever changes.

The current business_settings address and service origin should be copied to the default branch as its physical location/coverage. Retain business-level contact fields only if they mean corporate/business contact rather than branch contact. Do not silently reinterpret them in the UI.

## 3. Authorization model

| Actor | Branch discovery | Reads | Writes |
| --- | --- | --- | --- |
| OWNER | All active and inactive branches in this client deployment. | All branch operations, appointments, authorized customer records, payments, reports, and branch comparisons. | Create/edit/deactivate branches; grant/revoke ADMIN and STAFF branch assignments; manage any branch. Preserve current AAL2 requirement. |
| ADMIN | Only currently assigned branches. One assignment selects automatically; multiple assignments show only assigned choices and an “All assigned branches” option. | Only assigned-branch operations, appointment/payment/report data, and branch-scoped customer history. A shared customer row may be visible if relevant to an assigned branch; other-branch appointment history must still be filtered. | Manage only assigned-branch operations. Cannot grant/revoke branch membership, create OWNER access, or access business-wide financial data beyond assigned branches. Preserve AAL2 requirement. |
| STAFF | Only branches with a current staff assignment. Hide the selector for one assignment; otherwise show only assigned branches. | Own authorized appointments and schedule/operational data only. Branch membership alone does not grant all appointments or customer history at that branch. | Existing role-permitted appointment transitions, own availability/notes, and other explicitly authorized operations only. No ADMIN/OWNER settings or branch membership management. |
| CUSTOMER | Public active branch list. | Own profile and own appointments/payments across branches in this client deployment. | Own permitted account and appointment actions. Branch selection never changes ownership. |
| GUEST | Public active branch list. | Only the existing appointment-scoped view/manage capability proven by its token. | Only the operations permitted by that token. Branch membership and branch IDs do not expand token scope. |
| ANON | Active, published, branch-safe projection only. | Public branches, offerings, staff, hours, closures, and advisory availability. | No protected writes. Public booking remains through existing rate-limited server/database boundaries. |

### Database and server enforcement

- Add stable helpers such as current active actor checks, OWNER checks, ADMIN branch membership checks, and STAFF assignment checks. Keep role and branch membership separate.
- OWNER branch access is bounded to the current dedicated client database. ADMIN predicates require the global ADMIN role plus a current active branch membership. STAFF predicates require the STAFF role, active staff profile, active branch assignment, and existing per-record staff authorization.
- Preserve AAL2 in the verified server context and database administrative authorization paths. Do not trust user-editable Auth metadata.
- Membership queries must consult current database rows. Do not cache branch access in long-lived claims or let a selected branch grant access. Revocation must affect the next protected operation even if an old browser tab still has a branch URL.
- Apply RLS to every branch table and every table carrying branch-specific records. Use both USING and WITH CHECK for updates. Revoke broad table grants where the existing pattern requires narrow grants.
- Keep private schema unexposed. Public branch data should use a safe projection/RPC, not unrestricted table access.
- Review every SECURITY DEFINER routine and every service-role server action. They must validate the effective branch and current actor independently because service_role bypasses RLS.
- Any invalid or unauthorized branch selector must fail closed with a generic unavailable/forbidden result. Do not silently switch an unauthorized ADMIN to All Branches.
- Make ADMIN assignment changes OWNER-only in the database, not just hidden in the user interface. Audit who granted or revoked access and when.
- On staff assignment revocation, stop future access immediately. Warn the OWNER about future appointments and require transfer/reassignment or a deliberate effective date before removing operational access. Keep the assignment row and appointment history.

## 4. Branch selector and workspace behavior

Treat the branch context as a validated filter supplied to each server-rendered route. Preserve it in navigation links, pagination, filters, forms, calendar deep links, and refreshes. A URL branch slug or opaque ID is not a credential and must be revalidated on every request.

- OWNER with multiple branches can select a single branch or All Branches.
- ADMIN with multiple memberships can select one branch or All Assigned Branches; the server constructs that list from current memberships rather than accepting a client-provided list.
- STAFF with one branch has no selector. STAFF with multiple branches sees only their assignments, and even then continues to see only operational records they are individually authorized to access.
- A single-branch business automatically uses its only active branch and hides the selector.
- Persist branch context in the URL for refreshes/deep links. A server-validated remembered default may improve navigation, but the URL always remains untrusted and membership is rechecked.
- When All Branches is selected, branch-specific settings forms are disabled until a specific branch is chosen. Consolidated read-only views identify the associated branch on each row.
- Reject branch-specific writes from an All Branches view instead of guessing which branch should be changed.
- During rollout, unscoped legacy admin RPC calls should continue only while the installation has exactly one active branch. They must fail closed when a second branch exists.

## 5. Customer, guest, booking, Home Service, and payment flows

### Customer and guest identity

Keep the current one-account-per-client-business customer identity. A customer can see their own appointments from every branch; a branch selector must not filter customer self-service history by default. An ADMIN can see a customer record only when that customer has relevant activity at an assigned branch, and can see only the authorized branch-specific appointment history. STAFF can see only customers tied to the staff member’s permitted appointments.

Guest access remains tied to an appointment token. The token hash, expiration, single-use rules, and appointment binding remain authoritative. A public branch list or branch ID cannot be used to retrieve another appointment.

For unique-customer reporting, count registered users by their unique customer/Auth linkage. Count guest customer records by their existing customer identity unless an explicit safe merge process is separately approved. Never use contact-string matching as proof of identity.

### Public booking

For more than one active, bookable public branch, change the flow to:

**Choose Branch → Choose Service → Choose Staff → Choose Date/Time → Confirm Booking → Payment if required.**

The branch determines the public service offering and effective price, assigned staff, timezone, hours, closures, booking rules, and Home Service coverage. Server actions pass a selected branch to trusted validation, but PostgreSQL re-resolves its status, eligibility, and current data. The appointment receives its branch and immutable price, duration, buffer, timezone/policy, payment, and Home Service snapshots in the same trusted booking transaction.

For one active branch, skip the new step and use the default branch automatically. Existing guest/customer identity flows, rate limits, idempotency keys, appointment lifecycle, acceptance checks, and payment rules stay in force.

### Home Service

Store each branch’s service origin/coverage independently. For an address with coordinates, calculate the eligible active branches and eligible service/staff set on the server. If more than one qualifies, the recommended default is the nearest branch with a valid offering and schedule, shown to the customer before submission. Permit manual choice only among eligible branches, and recompute eligibility at submission.

Do not return exact service destination coordinates or private addresses from public branch or availability endpoints. Save the exact destination in the existing appointment-scoped private location table. The selected branch is authoritative on the appointment and must be checked by the booking RPC. Branch-specific fee and travel time are included in the booking total and snapshots; later edits must not reprice the appointment.

### Payments and financial reports

Keep the existing single PayMongo configuration per client unless a separate merchant-account requirement is approved. Do not change webhook verification, payment idempotency, settlement, deposit/full-payment rules, expiration, late-payment review, or refund correctness as part of branch routing.

The payment branch comes from payment → appointment → branch. Webhook facts can locate a matching internal payment, but cannot set or override its branch. Owner and assigned Admin payment reads/reports are branch-scoped. A registered customer sees only their own payments. STAFF has no financial reporting access unless a separate explicitly authorized product requirement is approved.

Reports must distinguish appointment value, verified collections, deposits, outstanding balance, refunds, and payment exceptions. Count each payment once. For All Branches, calculate distinct customers according to the identity rules above and show branch comparisons. Never sum different currencies into one total.

## 6. Phased implementation roadmap

Every phase is additive and forward-only. Do not edit migrations already applied to a client project. Apply the implementation independently to a staging copy and then to each dedicated client installation through a reviewed release process.

### Phase 0 — Decisions and release preconditions

**Objectives:** Approve the architecture boundary and resolve the decisions listed in the audit before database work.

**Database:** None.

**Backend:** None.

**Frontend:** None.

**Security:** Confirm the production/client hosting arrangement supports commercial managed applications. Identify one non-production client-like environment for migration and cross-role tests.

**Tests:** Capture the existing migration version list, current auth/MFA rules, booking invariants, payment behavior, and one-branch E2E baseline for the implementation branch.

**Acceptance criteria:** Approved defaults exist for timezone, currency, leave semantics, Home Service branch routing, branch-specific price/payment rules, revocation behavior, and Vercel plan/project ownership.

**Dependencies:** Zentra implementation review and hosting-provider decision.

**Risks:** Starting schema changes before approval can lock in an ambiguous payment, time-zone, or assignment model.

### Phase 1 — Database foundation, default branch, and authorization

**Objectives:** Add the branch data model without changing the observable single-branch experience. Establish branch-aware database permission helpers before enabling a second branch.

**Database:** Add branches, branch booking settings, branch service offerings, ADMIN memberships, and STAFF assignments. Add branch IDs to hours, closures, staff schedule/eligibility, booking policy versions, and appointments using an expand/backfill/validate/contract sequence. Backfill one default branch from current business address, timezone, contact and Home Service origin. Copy existing services, policies, hours, closures, staff assignments/service links, ADMIN grants, and all historical appointments to that branch. Use safe, rerunnable backfill guards and validation queries. Add indexes, composite integrity constraints, RLS, grants, and required realtime invalidation triggers. Do not delete or rewrite historical payment/appointment facts.

**Backend:** Add membership-aware helpers. Add/adjust protected RPC boundaries for access context, admin/catalog data, appointment acquisition/transition, availability and booking so branch consistency is checked in PostgreSQL. Keep existing APIs compatible with exactly one active default branch; reject unscoped operations once multi-branch mode is enabled.

**Frontend:** No second-branch UI yet. Existing screens continue to use the default branch transparently.

**Security:** Replace deployment-wide Admin access on branch data with OWNER-all / ADMIN-assigned predicates. Keep STAFF own-record checks in addition to branch assignment. Do not grant branch access from role, query parameter, storage path, or JWT metadata alone. Preserve owner/Admin AAL2 and private schema boundaries.

**Tests:** Apply migrations to an isolated database snapshot. Assert row counts/foreign keys are preserved, default-branch backfill is complete, all new tables have RLS and restricted grants, direct unauthorized branch queries fail, existing OWNER/ADMIN/STAFF/CUSTOMER/GUEST one-branch paths still work, and overlap prevention remains global per staff.

**Acceptance criteria:** Every pre-existing operational record resolves to the default branch; all historical payments resolve to that branch through appointments; no branch membership can elevate a role; one-branch routes still work; no unscoped protected operation can see data from a second branch.

**Dependencies:** Phase 0 decisions and staging/backup process.

**Risks:** Large table locks, incomplete backfills, migration/app version mismatch, accidental weakening of existing RLS, and old app instances surviving after a second branch is activated.

### Phase 2 — OWNER branch management and assignments

**Objectives:** Give OWNER a safe way to add and operate branches, and assign existing ADMIN/STAFF accounts without changing their roles.

**Database:** Add/complete OWNER-only RPCs for branch creation/edit/deactivation and membership grant/revoke. Write audit rows. Prevent hard deletion and define protection for the last active branch. Validate branch slugs, timezones, coordinate ranges, and assignment foreign keys.

**Backend:** Recheck OWNER, active profile, current AAL2, and target IDs inside each mutation. Reject self-service assignment changes by ADMIN/STAFF. Warn or block staff revocation when unresolved future appointments exist; require OWNER transfer or a deliberate future effective time.

**Frontend:** Add focused OWNER branch list/create/edit/deactivate screens and assignment controls on ADMIN/STAFF management. Show status, timezone, address, assignment count, upcoming appointment impact, and clear confirmation feedback.

**Security:** Revoke branch management from ADMIN and STAFF at the RPC/RLS boundary. Log actor, target user, branch, operation, and time without copying unrelated private details.

**Tests:** OWNER creates/edits/deactivates; ADMIN and STAFF attempt direct RPC forgery and are denied; a roleless user cannot add memberships; revoked membership stops working on the next server/RLS request; branch history remains readable to OWNER.

**Acceptance criteria:** OWNER alone can grant/revoke memberships; assigned roles remain unchanged; inactive branches stop accepting new public bookings but retain history and reporting.

**Dependencies:** Phase 1 schema and helpers.

**Risks:** A UI-only restriction, unresolved future appointments after staff reassignment, or accidental branch deletion.

### Phase 3 — Branch-scoped workspaces and selector

**Objectives:** Add a reusable selector and branch-aware operational lists before allowing customers to book a new branch.

**Database:** Update admin_data, admin_customer_directory, catalog_data, staff workspace data, appointment detail, payment/report query paths, notification badge counts, and RLS policies to use branch scope. Add branch IDs/names to consolidated operational projections.

**Backend:** Resolve the caller’s authorized branch set once per protected request from live membership. Validate branch context for all direct reads after an aggregate RPC. Return only assigned branch data. Scope admin customer history and Home Service location reads. Derive payment scope by appointment.

**Frontend:** Add the shared selector to OWNER/ADMIN/eligible STAFF shells. Preserve selection in navigation, filters, pagination, forms, calendars, and deep links. Hide it for a single branch/assignment. Disable branch-specific settings writes when All Branches is selected. Include branch labels in consolidated lists.

**Security:** Do not accept client-created “All branches” ID arrays. Build All Assigned Branches from the authorization query. Fail closed for an unauthorized URL branch. Staff retain per-appointment authorization rather than receiving every record in an assigned branch.

**Tests:** Cross-branch positive and negative tests for dashboard, appointment details, calendar, customers, payments, reports, staff, services, closures, direct table queries, secondary reads, and exports. Test unauthorized branch IDs and membership revocation with stale tabs/tokens.

**Acceptance criteria:** OWNER sees all branches; ADMIN sees exactly assigned branches; STAFF sees assigned branch context but only authorized operational records; other-branch histories/financials never appear; all-branch rows show their branch.

**Dependencies:** Phase 1 security boundary and Phase 2 membership data.

**Risks:** The large admin_data RPC may conceal scope omissions; direct secondary queries and badge counts can bypass the main query.

### Phase 4 — Branch schedules, availability, public booking, and Home Service

**Objectives:** Enable correct branch-specific public choices and booking transactions.

**Database:** Scope operating hours, closures, staff schedules/exceptions, service eligibility, effective service price/payment settings, branch booking approval, policy versions, availability, and Home Service coverage to branch. Add global staff/time conflict protection and branch consistency checks to booking/acceptance functions.

**Backend:** Update public branch/catalog projections and server availability/booking RPCs. Resolve effective branch price and policy inside PostgreSQL. Calculate Home Service eligibility and fee against one branch. Store immutable branch, policy, effective price, payment, timezone, and Home Service snapshots. Keep guest token issuance appointment-scoped.

**Frontend:** For multiple active public branches, add Choose Branch before service. Make subsequent choices reflect only that branch. Show branch address, timezone, service price, approval mode, and coverage before confirmation. Single-branch flow skips the step. For Home Service, show only eligible branches and recompute eligibility at submit.

**Security:** Public projection contains only active/public branch facts. Exact home addresses/coordinates stay private. Branch input does not bypass service/staff eligibility. The booking submit rechecks branch status, service offering, staff assignment, hours, closure, rate limit, idempotency, and slot under the trusted database boundary.

**Tests:** Branch-specific service/price/hours/closure/staff/approval behavior; public branch filtering; address coverage boundaries; multi-eligible branch tie; unauthorized staff/branch IDs; DST/timezone boundary; double booking across branches for one staff; guest and registered booking; duplicate submission; no actual payment submission.

**Acceptance criteria:** A booking can only be created for an active compatible branch, offering, and assigned staff; amount/time snapshots match server truth; single-branch behavior is unchanged; staff overlap is prevented across locations.

**Dependencies:** Phases 1–3 and approved Home Service routing semantics.

**Risks:** Time-zone conversion, coverage overlap, outdated slot results, price override/deposit arithmetic, and branch changes after selection.

### Phase 5 — Payment attribution, notifications, and analytics

**Objectives:** Make branch filtering complete for operational notifications and financial reporting without changing payment settlement correctness.

**Database:** Add indexes for appointment-branch payment/report joins. Keep payment branch derived from appointment. Add branch references only for non-appointment notification/audit events that otherwise cannot be scoped. Ensure outbox/event triggers include new branch tables.

**Backend:** Scope outbox-derived notifications and unread/badge counts. Update admin reports and payment/refund screens with branch filters and branch comparisons. Keep verified webhook settlement, provider idempotency, expiration, late payment, refund, and reconciliation logic unchanged.

**Frontend:** Display branch on each consolidated appointment/payment/report row. Show per-branch verified collection, booking value, deposits, outstanding balance, refunds, and unique customer counts separately. Do not present mixed currencies as one total.

**Security:** Webhook/payment branch is derived from the internally matched appointment. Never trust provider metadata or browser-return query parameters for branch attribution. STAFF receives no financial data by default.

**Tests:** Each payment appears once in its appointment branch; unauthorized ADMIN cannot read or aggregate another branch; late payment and refunds keep attribution; badges are filtered by current scope; unique customer logic does not duplicate registered accounts.

**Acceptance criteria:** Per-branch and consolidated financials reconcile to appointment/payment rows; existing settlement and refund state transitions pass their unchanged regression suites.

**Dependencies:** Branch-bearing appointment writes from Phase 4.

**Risks:** Double counting, selecting only some assigned branches in a consolidated view, and allowing branch attribution to diverge from the appointment.

### Phase 6 — Security verification, responsive QA, and staged release

**Objectives:** Verify the whole branch boundary and release safely per client installation.

**Database:** Run schema/migration history checks, RLS/grant review, indexes/EXPLAIN for representative branch counts, and snapshot/backup validation. No client project receives a migration until its own history is reconciled.

**Backend:** Audit every Route Handler, Server Action, SECURITY DEFINER function, view, RPC, Realtime channel, Storage policy, search, export, report, cron job, and service-role query against the authorization matrix.

**Frontend:** Verify mobile/tablet/desktop selector behavior, accessible labels, no horizontal overflow, branch labels, safe empty/error states, and no confusing branch-specific edit control in All Branches.

**Security:** Test OWNER/ADMIN/STAFF/CUSTOMER/GUEST/ANON with separate sessions. Include direct SQL/RLS, RPC tampering, branch ID substitution, pagination/search/export leakage, revoked assignment, guest token scope, storage path guessing, realtime, exact Home Service location, and payment/refund data.

**Tests:** Unit, database, integration, E2E, and production-build checks. Use test-only data and stubbed email/payment providers. Run concurrent appointment submissions across branches and prove one staff member cannot overlap. Conduct a read-only managed Supabase advisor check after migrations.

**Acceptance criteria:** All security denials and allowed paths are demonstrated; existing one-branch workflows and payment lifecycle remain green; migration history and backups are verified for the target project; business owner approves the release window; monitoring and rollback/restore procedures are available.

**Dependencies:** Phases 1–5, a staging project, approved hosting plan, and per-client rollout authorization.

**Risks:** Cross-tenant operational mistakes during independent client releases, live data differing from repository assumptions, and unnoticed old app instances.

## 7. Affected route, RPC, table, and file inventory

### Routes and screens

- Shared protected workspaces: /admin, /staff, admin and staff layouts, shared app shell/navigation, calendar, appointment list/detail, customer list/detail, payment, report, service, staff, availability, closure, settings, and notifications screens.
- New OWNER branch management: recommended /admin/branches, with branch assignment actions integrated into /admin/access and staff management.
- Public site and booking: public branch/location listing; /book branch-first flow; public services/team projections; /api/availability; booking submit and confirmation.
- Customer and guest: /account appointment list/detail/payment views remain account-wide for registered customers; /booking/manage remains appointment-token scoped.
- API routes requiring explicit branch review: /api/availability, /api/booking/access and /inspect, /api/payments/checkout, /api/payments/verify, /api/webhooks/paymongo, /api/cron/notifications.

### Tables and database functions

Review and likely modify RLS, constraints, triggers, indexes, and/or projections for business_settings, booking_policy_versions, website_settings, user_roles, profiles, customers, staff, staff_services, service_categories, services, business_hours, staff_working_hours, staff_schedule_exceptions, business_closures, appointments, appointment_items, appointment_events, appointment_notes, guest_access_tokens, payments, refunds, payment_events, notification_outbox, notification_delivery_receipts, audit_logs, private.staff_details, private.admin_invitations, and appointment_home_locations.

New tables: branches, branch_booking_settings, branch_services, admin_branch_memberships, and staff_branch_assignments; consider an explicit branch staff-service join only if extending staff_services proves unsafe.

Review RPC groups: get_access_context; branch management/membership mutations; admin_data and admin_customer_directory; catalog_data, catalog_save_* and catalog_assign_services; public_catalog and public_website_data; server availability and booking submission; Home Service availability and booking; appointment acquisition/transition; payment preparation/checkout attachment/verified settlement/refunds; notification outbox; and Storage image ownership/cleanup.

### Source files

At minimum review: src/lib/auth/access.ts, src/lib/auth/access.server.ts, src/lib/auth/require-user.server.ts, src/components/layout/app-shell.tsx, src/components/layout/shell-nav.tsx, src/components/layout/navigation.ts, src/features/admin/data.server.ts, src/features/admin/pages.tsx, src/features/admin/calendar.tsx, src/features/admin/types.ts, src/features/catalog/data.server.ts, src/features/catalog/actions.ts, src/features/catalog/pages.tsx, src/features/appointments/actions.ts, src/features/appointments/service.server.ts, src/features/appointments/customer-data.server.ts, src/features/public-site/data.server.ts, src/features/public-site/booking-data.server.ts, src/features/public-site/booking-actions.ts, src/features/public-site/booking-wizard.tsx, src/features/availability/schemas.ts, src/server/email/outbox.server.ts, src/lib/payments/paymongo-settlement.server.ts, and src/components/layout/realtime-refresh.tsx.

Generated database types, validation schemas, fixtures/stubs, all affected SQL tests, integration tests, Playwright fixtures/specs, and deployment documents must be updated with the implementation.

## 8. Data migration and rollout strategy

1. Inventory each client project’s migration versions, table counts, current single business row, hours/closures, staff/service links, roles, appointments, and payment relationships. Do not infer all clients match the reviewed DEV/TEST project.
2. Take and verify a recoverable backup or provider-supported restore point for that specific installation. Test the complete forward migration against a sanitized clone first.
3. Add branch structures and nullable branch keys, seed exactly one default branch from current business settings, then backfill all existing branchless operational rows to it. Backfill all existing ADMIN users into the default branch membership and all existing staff profiles to the default branch. OWNER remains a global deployment-level role.
4. Verify every source row maps once; verify every appointment/payment/customer/history relation remains intact; validate branch consistency and staff-overlap constraints.
5. Add branch-aware RLS/helpers and security-definer checks before enabling creation of another branch. Keep the multi-branch flag off while the old UI is active.
6. Deploy branch-aware application code while the default branch remains the only active branch. An old/unscoped RPC must fail closed if another active branch exists.
7. Test OWNER, ADMIN, STAFF, customer, guest, and anonymous behavior in staging. Only then allow OWNER to create/activate additional branches.
8. Roll out independently to each client project, recording code version, migration version, backup/restore proof, smoke tests, and branch activation approval.

The multi-branch flag should not be set based on a client-side setting. Database-side behavior must keep a one-branch compatibility path and reject ambiguous unscoped reads/writes after a second branch becomes active.

## 9. Acceptance criteria for implementation approval

- One client’s branches exist only in that client’s dedicated project/database; another client deployment shares no records or Auth users.
- A new installation receives one active default branch and follows the same one-branch UX without unnecessary controls.
- OWNER can operate every branch and remains protected by AAL2.
- ADMIN sees only owner-assigned branches, including through direct queries, reports, exports, RPCs, private Home Service data, storage, and realtime-triggered refreshes.
- STAFF remains limited to assigned branches and role-authorized appointment/customer operations; a branch assignment is not blanket customer access.
- Assignment revocation takes effect on the next protected database/server operation and cannot be bypassed by an old URL, tab, token, or cached selector.
- Every new appointment has a branch consistent with its policy, service offering, and staff assignment. Price/payment/timezone/Home Service terms are server-derived and snapshotted.
- A staff member cannot be double-booked across branches.
- Customers keep one account per client business; they see their own cross-branch bookings. Guests retain appointment-scoped access only.
- Home Service selects an eligible branch, snapshots its fee, and does not expose exact destination data publicly.
- Payments, refunds, and reports reconcile to appointment branch without changing payment settlement or idempotency semantics.
- All new tables have RLS, least-privilege grants, correct server-side checks, and required realtime invalidation behavior.
- Migration history, backups, responsive QA, branch-level security tests, payment regressions, and per-client deployment steps are verified before release.

## 10. Approval decisions before implementation

The recommended defaults are documented in the Phase 0 audit. Zentra should confirm:

1. Commercial Vercel plan and permitted project ownership for hosted client applications.
2. One business-wide currency for all branches in the first release.
3. Branch timezone immutability or historical timezone snapshot behavior.
4. Global versus branch-specific staff leave.
5. Whether a customer can manually choose among Home Service-eligible branches or the nearest eligible branch is automatically selected.
6. Whether branch services can override payment mode/deposit as well as total price and Home Service fee.
7. How staff assignment revocation handles upcoming appointments and history access.
8. Branch public visibility, location-page needs, and whether business-wide announcements/policies remain global.
9. Client-by-client backup, staging, migration approval, release-window, and support process.

These decisions are implementation prerequisites, not blockers to the architecture review.

## Plan conclusion

This plan preserves the existing deployment isolation and single-branch behavior while introducing branch-scoped operational data and database-enforced access. It is ready for Zentra’s implementation review; no application, database, deployment, or Git changes were made as part of Phase 0.
