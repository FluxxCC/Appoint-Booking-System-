# Multi-Branch Architecture Audit

**Phase:** 0 — read-only investigation
**Date:** 2026-10-07
**Repository revision inspected:** main at 3d2c11e
**Scope:** repository, local migration/type sources, read-only schema and migration metadata for the linked DEV/TEST Supabase project, authorization paths, booking and payment workflows, and deployment notes.

## Outcome

The codebase is a single-business application intended to be deployed separately for each client. Multi-branch support belongs inside each client’s existing deployment and database. The repository and live DEV/TEST schema currently implement a single location per business. There are no branch tables, branch memberships, branch identifiers, or branch-aware authorization checks.

This is a cross-cutting database and authorization change. A branch selector by itself would be unsafe. Every server query, SQL function, RLS policy, write operation, report, file policy, and realtime-triggered refresh that handles branch data must use the same database-backed branch authorization rules.

No application, migration, database, deployment, or Git changes were made during this audit. The only planned write scope is creation of this report and the separate implementation plan.

## Evidence labels and limits

- **REPOSITORY VERIFIED** means confirmed by current source, migrations, generated types, or checked-in deployment configuration.
- **DEV/TEST VERIFIED** means confirmed by read-only metadata queries against Supabase project obpyyjewnsygkxobyunw, named Appointment Booking System.
- **DOCUMENTED, NOT LIVE VERIFIED** means found in a repository document but not confirmed against the provider account or production runtime.
- **PROPOSED** means an architecture recommendation, not an existing implementation.
- **UNVERIFIED** means access, configuration, or product semantics were not available in this Phase 0 review.

The Supabase inspection read project metadata, table columns/constraints, RLS-enabled flags, policy names, relevant function names/security-definer flags, and migration history. It did not read customer rows, appointment contents, payment data, secret values, or Auth tokens. No production client project was identified or queried. Therefore, hosted DEV/TEST evidence does not establish the state of any client’s production deployment.

## Business and infrastructure model

**REPOSITORY VERIFIED:** The system architecture describes one reusable codebase and a dedicated Next.js/Vercel project, Supabase project/database/Auth/Storage, domain, environment, and assets for each client. It explicitly excludes a shared tenant database, tenant discriminator, SaaS subscription platform, and self-service business registration. The branch feature must therefore be limited to one client installation at a time; branch IDs are not tenant IDs.

**DEV/TEST VERIFIED:** The linked Appointment Booking System project is active and healthy in ap-southeast-1 (Singapore) and runs PostgreSQL 17.6. The live migration inventory reports the current application migration sequence through 20261006083804, the website appearance migration. The live application tables returned in public and private all have RLS enabled. The live table inventory contains no branch or branch-membership table.

**DOCUMENTATION RECONCILIATION REQUIRED:** docs/deployment/connected-project.md, docs/deployment/availability-engine.md, and older sections of docs/architecture/system-architecture.md still describe an earlier migration state and say that migration-history reconciliation or Phases 5/6 remain outstanding. Those statements conflict with the DEV/TEST migration inventory observed on 2026-10-07. Treat the live metadata as the current DEV/TEST evidence; refresh the historical deployment notes before using them to authorize a future migration rollout. This audit did not alter those documents or apply migrations.

**Commercial hosting decision required:** Existing repository deployment notes describe Vercel Hobby hosting. Zentra’s stated model charges clients for customized software and managed hosting. Vercel’s current Terms say Hobby is for personal or non-commercial use. Before a commercial client rollout, Zentra must confirm the permitted Vercel plan and ownership arrangement for managed client projects; do not assume that a Hobby project is eligible. See [Vercel Terms of Service](https://vercel.com/legal/terms) and [Vercel pricing](https://vercel.com/pricing).

## Current architecture findings

### Data model

The current database has an implicit single-business boundary: each deployment has one singleton business_settings row and one singleton website_settings row. There is no business_id column on application records because the database itself is dedicated to one business.

| Area | Verified current design | Multi-branch consequence |
| --- | --- | --- |
| Business identity | business_settings is a singleton containing name, timezone, currency, contact/address, booking policy settings, and Home Service origin/radius. website_settings is a singleton containing logo, theme, and public-site sections. | Keep client identity and brand at the deployment/business level. Move physical operating-location facts to branches; do not add tenant registration or a shared client table. |
| Roles and profiles | profiles links one profile to one Auth user. user_roles stores global OWNER, ADMIN, and STAFF roles. OWNER/ADMIN are not branch-scoped today. | Branch membership must be a separate authorization relation. A branch assignment must never grant a role. |
| Customers | One customers row can link to one Auth user; the Auth link is unique. Appointments reference a customer. | Keep one registered customer account across all branches in a client database. Derive branch customer lists and histories from authorized appointments, not duplicated per-branch customer rows. |
| Staff | staff.auth_user_id is unique, so a linked Auth account maps to one staff profile. Staff-service eligibility and working hours are global to the one current location. | Keep one staff identity and add one-to-many branch assignments. Store branch-specific hours and service eligibility separately from global staff identity. |
| Services | services and categories form one global catalog with one base price and booking/payment settings. staff_services links staff to services. | Add branch offerings for availability and optional price/payment overrides; keep service identity and descriptive content shared where appropriate. |
| Operating hours | business_hours and business_closures have no branch key. Staff hours and schedule exceptions key to staff only. | Scope opening hours, closures, staff hours, and branch-specific exceptions. Define cross-branch leave semantics explicitly. |
| Appointments | appointments contains one staff_id, one customer_id, one policy-version reference, times, money snapshots, and state; appointment_items currently enforces one item per appointment. No branch ID exists. | Each appointment needs an authoritative immutable branch. Existing snapshots and appointment history must remain intact. |
| Reservation safety | appointments_no_staff_overlap is a PostgreSQL GiST exclusion constraint over staff_id and occupied time range. private.lock_schedule() takes a deployment-wide advisory lock. | Preserve a global-per-staff overlap guarantee. Do not include branch in the exclusion key: that would permit the same staff member to be booked at two branches at once. |
| Payments | payments reference appointment_id; settlement, refund, and event records follow that payment/appointment relationship. There is no independent branch key. | Attribute a payment to the appointment’s authoritative branch by joining through the appointment. Avoid a second mutable branch value on payments. |
| Home Service | One origin and radius live on business_settings; service fees/travel buffers live on services; exact address and coordinates are isolated in appointment_home_locations. | Move coverage to branch configuration and resolve every Home Service request to exactly one branch. Keep exact address/coordinates private and appointment-scoped. |
| Notifications and audit | Appointment notifications use notification_outbox; operational records include audit logs and delivery receipts. | Derive appointment notification branch from its appointment; protect non-appointment branch events with a branch reference and the same authorization policy. |
| Storage | The public catalog-images bucket stores marketing images with strict object-path conventions. Uploads and cleanup use live MFA-protected admin checks. | Add branch-aware object ownership only for branch-scoped assets. A folder name or client-supplied branch ID cannot authorize an upload or deletion. |

### Application and authorization paths

The Next.js App Router is a modular monolith. Server Components and feature data services call typed Supabase RPCs and RLS-protected table queries. The most important current paths for a branch implementation are:

- Protected context and MFA: src/lib/auth/access.server.ts, src/lib/auth/require-user.server.ts, src/lib/auth/access.ts, src/proxy.ts, and supabase/migrations/20260929125716_auth_application.sql.
- Shared shell and navigation: src/components/layout/app-shell.tsx, src/components/layout/shell-nav.tsx, and src/components/layout/navigation.ts.
- Admin data aggregation and secondary reads: src/features/admin/data.server.ts, src/features/admin/pages.tsx, src/features/admin/calendar.tsx, and src/features/admin/types.ts.
- Catalog and staff: src/features/catalog/data.server.ts, src/features/catalog/actions.ts, src/features/catalog/pages.tsx, src/features/staff/admin-access-data.server.ts, and src/features/staff/invitation-actions.ts.
- Appointment mutations and customer history: src/features/appointments/actions.ts, src/features/appointments/service.server.ts, and src/features/appointments/customer-data.server.ts.
- Public catalog and booking: src/features/public-site/data.server.ts, src/features/public-site/booking-data.server.ts, src/features/public-site/booking-actions.ts, src/features/public-site/booking-wizard.tsx, and src/features/availability/schemas.ts.
- API boundaries: /api/availability, /api/booking/access, /api/booking/access/inspect, /api/payments/checkout, /api/payments/verify, /api/webhooks/paymongo, and /api/cron/notifications.
- SQL aggregation/authorization surfaces include get_access_context, admin_data, admin_customer_directory, catalog_data, public_catalog, public_website_data, server availability and booking RPCs, appointment transition/acquisition functions, payment attempt/settlement RPCs, and notification outbox RPCs.

requireArea("admin") verifies a real confirmed Auth user, reads live access context, and requires AAL2. The database’s private.is_admin() and private.is_owner() also require AAL2 and a current global role. OWNER-only access grants and staff identity links use dedicated guarded RPCs. These controls are important existing invariants.

The admin_data and catalog aggregation functions are SECURITY INVOKER paths and rely on RLS; many other narrow transactional functions are SECURITY DEFINER with explicit grants. The admin server module also performs follow-up direct table reads for payment references, appointment/customer linkage, and private Home Service locations. A branch-safe implementation must update both the aggregation and these secondary reads.

Public booking and availability already cross server/database trust boundaries. Availability results are advisory; PostgreSQL revalidates a request and reserves accepted time under the schedule lock and exclusion constraint. Guests use hashed, expiring appointment-scoped tokens. A selected branch must not change these guarantees or broaden a guest token’s scope.

Supabase Realtime emits payload-free invalidation hints. The browser refreshes and the server re-reads through authorization, RPCs, and RLS. New branch tables must join the trigger inventory and be classified as public-safe or private; branch names, appointment facts, customer data, and exact addresses must not be placed in broadcast payloads.

### Current database security boundary

RLS is enabled on the live application tables. Policies and helpers currently authorize OWNER/ADMIN as deployment-wide administrators. Staff appointment access is based on the linked staff identity and appointment assignment; customer access is based on customer ownership and existing operational rules. This is correct for the current one-location data model but cannot implement ADMIN branch restrictions until membership-aware predicates exist.

The branch ID in a URL, form, or client state is a **selection hint**, never a permission. Use live database membership checks in RLS and every server/RPC operation. Do not place branch membership only in JWT metadata: authorization must respond promptly to reassignment and revocation. Service-role clients bypass RLS, so every privileged server operation must independently validate the actor’s current role and branch before reading or mutating branch data.

The following paths are especially sensitive:

1. admin_data and admin_customer_directory aggregate many business domains and must validate the requested scope before returning rows or counts.
2. Catalog writes, staff profile/schedule changes, appointment decisions, and branch management need server and database enforcement for the target branch.
3. Payment/refund/report queries must scope via the appointment’s branch, including follow-up reads and exports.
4. appointment_home_locations contains exact addresses and coordinates. Branch access must be checked through the appointment as well as current role/assignment rules.
5. Webhooks and checkout verification use a privileged client. They must derive branch from the matched internal payment and appointment, never from a webhook payload or browser argument.
6. Realtime may trigger broad refreshes, but refreshed server data must be scoped from current membership.
7. Storage insert/delete policies and catalog_set_image must authorize the referenced branch object, not just check an administrator role or path prefix.

## Existing single-branch assumptions to replace deliberately

1. A single timezone, currency, operating address, and contact location are read from business_settings.
2. One business-hours schedule and one closure list govern all availability.
3. Staff work hours, exceptions, staff-service links, and reservations have no location dimension.
4. One global service price, deposit/payment configuration, and Home Service fee applies.
5. booking_policy_versions are global rather than per location.
6. Admin selectors and reports assume every authorized ADMIN can see every appointment/customer/payment.
7. Staff workspaces rely on the staff profile/appointment association without branch assignments.
8. Customer lists are compiled from deployment-wide data; payment and Home Service details are attached after the main query.
9. Public branch selection does not exist. The booking wizard starts with service selection.
10. Notifications and badges are role-wide and appointment/business-wide rather than branch-filtered.
11. The exclusion constraint is correctly global per staff. This behavior must remain global even after staff can work at multiple locations.

## Deployment, operating cost, and scale findings

One additional active branch should add rows, indexes, asset usage, queries, and realtime refresh traffic to the existing client project; it should not create another Vercel project or Supabase database. A new client still receives its own isolated deployment/database as required by the business model.

Cost characteristics are qualitative because provider plans and rates change:

| Provider/resource | Cost behavior relevant to this design |
| --- | --- |
| Supabase | Every project has its own Postgres compute instance, so a dedicated database per client has a per-project compute baseline. Organization plan subscription and some usage quotas are organization-level; storage, database size, egress, Realtime messages/connections, Auth MAUs, logs, and backup/PITR choices can grow with usage. All branches within the same client database share that client project’s capacity. See [Supabase billing FAQ](https://supabase.com/docs/guides/platform/billing-faq), [billing and usage](https://supabase.com/docs/guides/platform/billing-on-supabase), and [egress usage](https://supabase.com/docs/guides/platform/manage-your-usage/egress). |
| Vercel | Plan/team ownership and usage should be priced for the actual client hosting model. Function invocations/runtime, builds, requests, and data transfer can grow with traffic. Do not extrapolate the Hobby allowance to a commercial client rollout. See [Vercel pricing](https://vercel.com/docs/pricing) and the [Terms of Service](https://vercel.com/legal/terms). |
| Resend | Transactional email usage and domain count can increase with branch-specific operational volume and number of branded client domains. Verify current plan/overage terms before pricing. See [Resend pricing](https://resend.com/pricing). |
| PayMongo | Processing fees are transaction/channel dependent and must be checked against the merchant’s current agreement. Branches do not require separate PayMongo accounts in this architecture. See [PayMongo pricing](https://www.paymongo.com/en/pricing). |
| Support and operations | Additional locations increase user provisioning, branch schedule/catalog setup, support, training, and test/release effort even if hosting capacity remains adequate. Zentra should price this through client agreements, not application SaaS billing. |

These links were checked on 2026-10-07. They are references for a later cost estimate, not a quotation or provider-plan approval.

## Risks and required controls

| Risk | Why it matters | Required design response |
| --- | --- | --- |
| UI-only filtering | Direct RPCs, IDs, forms, or API calls can bypass a selector. | Enforce membership in RLS and every server/RPC operation. Test ID tampering. |
| Global ADMIN predicate | Current is_admin() grants operational scope across the one deployment. | Add branch-aware helpers and migrate every policy/RPC from global ADMIN access to explicit membership, with OWNER as the all-branch exception. |
| SECURITY DEFINER and service-role bypass | These paths do not inherit ordinary browser RLS behavior. | Audit every definer function and privileged client call; validate actor, role, branch, and resource in the trusted operation. |
| Revocation staleness | JWT branch claims or cached UI state can survive an assignment removal. | Read current membership from the database on each protected operation; refresh navigation after changes. |
| Cross-branch double booking | Staff may work in more than one branch. | Keep overlap enforcement on staff ID and absolute occupied time range across all branches. |
| Customer overexposure | A shared customer may visit several branches. | Admin directory results and history are limited to assigned branches; staff still sees only operationally authorized appointments. |
| Financial misattribution | A copied/alterable branch value could move revenue. | Attribute payment/refund through immutable appointment branch; verify report joins and payment idempotency remain unchanged. |
| Home Service privacy | Exact address and coordinates are highly sensitive. | Resolve one branch server-side; keep location data on the appointment-scoped private table; never include exact coordinates in public availability or branch APIs. |
| Deactivation and historical data | Deleting or moving a branch can break foreign keys, reporting, or audit evidence. | Deactivate branches; retain historical references; do not cascade-delete operational records. |
| Migration locks/backfill | Branch keys affect many high-write tables and constraints. | Expand/backfill/validate/contract in reviewed forward-only migrations against a backup/staging clone. |
| Branch report aggregation | A customer or payment can appear in several location views. | Use distinct customer identity rules and count each payment once. Keep currencies separate. |
| Hosting plan | Current notes state Vercel Hobby while Zentra describes commercial, third-party client hosting. | Resolve plan/ownership terms before deploying paid client systems. |

## Phase 0 decisions to take into implementation review

The proposed defaults appear in the implementation plan; confirm them before Phase 1:

1. Branch timezone: inherit the current business timezone at branch creation, then allow an explicit IANA timezone per branch.
2. Currency: keep one currency per client business/database initially; do not sum unlike currencies. Decide separately if cross-border branches are in scope.
3. Staff leave: a global leave blocks all assigned branch schedules; branch-specific unavailable/extra-hours exceptions affect only one branch.
4. Branch-specific terms and approvals: keep a versioned policy per branch so the request records the exact rules in force when it was created.
5. Service pricing: keep shared service content, with branch offering overrides for price and any payment/deposit values that are genuinely different.
6. Home Service routing: select from branches whose coverage contains the validated service coordinates; if several qualify, recommend nearest eligible branch and show it before confirmation. Confirm whether customers may manually choose among eligible branches.
7. Branch deactivation: stop new public bookings and operational assignment; preserve all existing appointments, payments, reports, audit entries, and guest tokens.
8. Cross-branch staff booking: confirm one staff identity can be assigned at several branches while one global conflict constraint prevents overlapping reservations.
9. Vercel plan and project ownership: confirm the arrangement authorized for Zentra-managed paid client websites.
10. Migration rollout ownership: identify the client installation/staging process and acceptable maintenance window before designing deployment automation.

## Verification sources reviewed

- docs/architecture/system-architecture.md
- docs/deployment/connected-project.md
- docs/deployment/availability-engine.md
- docs/deployment/public-booking.md
- docs/deployment/email-architecture.md
- docs/payments/paymongo-test-setup.md
- supabase/migrations/20260929123406_foundation.sql
- supabase/migrations/20260929123412_authorization.sql
- supabase/migrations/20260930103459_availability_engine.sql
- supabase/migrations/20261001121947_phase8_booking_lifecycle.sql
- supabase/migrations/20261002191431_phase_9_payment_attempt_preparation.sql
- supabase/migrations/20261003234500_app_realtime_refresh_signals.sql
- supabase/migrations/20261004232834_customer_directory_tabs.sql
- supabase/migrations/20261005130536_20261005101246_home_service_booking.sql
- supabase/migrations/20261006083804_20261005094639_admin_website_appearance.sql
- Read-only Supabase project/table/policy/function/migration metadata for the DEV/TEST project on 2026-10-07.

## Audit conclusion

**MULTI-BRANCH ARCHITECTURE AUDIT COMPLETE — READY FOR IMPLEMENTATION REVIEW**

This conclusion means the Phase 0 repository and DEV/TEST architecture investigation is complete. It does not mean multi-branch behavior has been implemented, that production projects were examined, or that Vercel commercial-plan eligibility has been resolved.
