# Phase 1.2 — Supabase DEV/TEST Migration Readiness

**Assessment date:** 2026-10-08  
**Target:** Appointment Booking System DEV/TEST — `obpyyjewnsygkxobyunw`  
**Boundary:** Phase 1 was applied only to this DEV/TEST project. No backup, restore, reset, production change, deployment, commit, or push was performed. A prior CLI history probe attempted to initialize a temporary remote login role and failed with a transport error; it was not repeated. A read-only catalog query found `cli_login_postgres` with an expired validity timestamp, whose origin could not be attributed without a pre-probe baseline.  
**Phase 1.2C update:** 2026-10-08. Rechecked current MCP tool availability, local CLI/client/connection capability, and official Supabase backup and migration documentation.  
**Phase 1.2 execution update:** 2026-10-08. A safe explicit `BEGIN`/`COMMIT` batch was verified through MCP `execute_sql`, including rollback of temporary DDL and migration-history writes. The complete Phase 1 migration, in-transaction verification, and history entry were then committed together.  
**Current verdict:** **PHASE 1.2 PASSED — DEV/TEST MIGRATION VERIFIED**.

Sections 1–6 preserve the pre-migration readiness assessment and the earlier CLI-only status. Section 7 records the final MCP execution and is authoritative for the current database state.

## Executive assessment

The connected project is the stated DEV/TEST project, is active/healthy, and runs PostgreSQL 17.6.1.171. Before Phase 1 execution, a read-only migration inventory showed 26 applied migrations through website appearance migration `20261006083804`; the Phase 1 migration was absent. Both required extensions were installed: `btree_gist` 1.7 and `pgcrypto` 1.3.

The pre-migration live schema matched the expected single-branch shape: no branch tables or `branch_id` columns existed; the constraints and trigger names that the migration replaces/disables were present; and affected public tables had RLS enabled. The DEV/TEST data was non-empty, including appointments, payments, customer identities, guest tokens, and 99 audit records.

The earlier CLI-only attempt was blocked by the lack of a safe CLI dry-run path. The current execution used the existing MCP connection with an explicit transaction, so no CLI, backup, Docker, or separate project was required. The migration is additive, and the final live checks confirmed the existing records were preserved. Historical CLI and recovery notes below are labeled as prior-state context.

## 1. Read-only DEV/TEST verification before migration

### Project and migration history

| Check | Result |
|---|---|
| Project identity | `Appointment Booking System`, ref `obpyyjewnsygkxobyunw` |
| Region / status | `ap-southeast-1` / `ACTIVE_HEALTHY` |
| Database version | Supabase project metadata: `17.6.1.171` (engine 17); SQL `server_version`: `17.6` |
| Applied migration count | 26 |
| Latest applied version | `20261006083804` (website appearance) |
| Phase 1 migration | Pre-migration state: `20261007120000_multi_branch_phase_1_foundation.sql` was absent |
| Supabase development branches | None listed |
| Project plan | Organization plan `free` |

Migration history and catalog checks were read-only. No production project was accessed.

### Extensions and schema shape

| Extension | Required by | Live state |
|---|---|---|
| `btree_gist` | Foundation migration / GiST exclusion constraints | Installed in `extensions`, version 1.7 |
| `pgcrypto` | Existing public booking migration | Installed in `extensions`, version 1.3 |

The five Phase 1 tables (`branches`, `branch_booking_settings`, `branch_services`, `admin_branch_memberships`, `staff_branch_assignments`) are absent. There are no existing `branch_id` columns in `public`. Required existing types (`payment_mode`, `schedule_exception_kind`, and `app_role`) exist.

The migration’s expected legacy unique/exclusion constraints were found with matching definitions, including `booking_policy_versions_version_key`, `staff_services_staff_id_service_id_key`, `business_hours_weekday_opens_at_key`, `business_hours_no_overlap`, `staff_working_hours_staff_id_weekday_starts_at_key`, `staff_hours_no_overlap`, and `appointments_no_staff_overlap`. They were validated in the live catalog. The migration keeps the appointment overlap exclusion global by staff and occupied range.

The 16 existing trigger instances named in the migration’s backfill suppression/re-enable block are present and enabled. These include timestamp/audit/immutability triggers on booking policies, staff-service links, business hours/closures, staff hours/exceptions, appointments, and audit history. No branch-object name collision was found.

RLS is enabled on all reviewed affected public tables; `FORCE ROW LEVEL SECURITY` is false. Current policies still use the pre-Phase-1 deployment-wide Admin helper where expected; Phase 1 replaces these with branch-scoped authorization. The target migration’s policy names and current policy inventory were compared.

### Function permissions and customer identity boundary

The live catalog shows:

- `private.calculate_availability(uuid,date,uuid,boolean)` is executable by `authenticated` and `service_role`, not `anon`.
- `private.validate_schedule(...)` is executable by `service_role`, not `anon` or `authenticated`.
- Existing catalog RPCs are `SECURITY INVOKER`, executable by `authenticated` and `service_role`, not `anon`.
- The public website projection is executable by `anon` and `authenticated`. `private.public_website_data()` is `SECURITY DEFINER`, executable by `anon`/`authenticated`, and has an empty search path. The local `supabase/config.toml` exposes only `public` and `graphql_public`, but the live PostgREST exposed-schema setting was not available from the read-only project/catalog tools and must be confirmed before rollout.
- The `private` schema currently grants `USAGE` to `anon` and `authenticated`; the migration does not remove that schema privilege. Function ACLs for migration-created/replaced functions are explicitly hardened in the migration, but the exposed-schema setting remains a verification item.
- `authenticated` has no table-level UPDATE on `customers`, cannot update `customers.auth_user_id`, and has column UPDATE on `display_name`, `email`, and `phone`. `service_role` does have UPDATE on `auth_user_id`; Phase 1’s `guard_customer_auth_linkage()` is intended to reject ownership changes even on that path while allowing Auth deletion cleanup.

No function was invoked under simulated customer/admin/staff sessions. The catalog inspection is not a live Auth or PostgREST behavior test.

## 2. Existing DEV/TEST data affected by the migration

Counts below were taken using read-only aggregate queries. No row values, account identifiers, appointment contents, payment details, or token hashes were retrieved.

| Relation / state | Rows | Migration impact |
|---|---:|---|
| `business_settings` | 1 | Source for default branch name/configuration; published, guest booking and customer registration are enabled; timezone `Asia/Manila`; approval mode `ADMIN_APPROVAL` |
| `user_roles` | 1 OWNER, 0 ADMIN | OWNER remains business-wide; no initial Admin membership rows are expected from current roles |
| `staff` | 3 | Seed 3 branch assignments, preserving each profile’s active state |
| `services` | 3 | Seed 3 branch offerings, preserving service active flags |
| `booking_policy_versions` | 1 | Add and backfill `branch_id`; replace version uniqueness with branch/version uniqueness |
| `staff_services` | 6 | Add and backfill `branch_id`; add branch/service/assignment foreign keys |
| `business_hours` | 6 | Add and backfill `branch_id`; replace unscoped overlap and unique constraints with branch-scoped versions |
| `staff_working_hours` | 18 | Add and backfill `branch_id`; replace unscoped overlap and unique constraints with branch-scoped versions |
| `business_closures` | 0 | Add `branch_id`; no existing rows to attribute |
| `staff_schedule_exceptions` | 0 | Add `branch_id` and `is_global`; no existing exceptions to classify |
| `appointments` | 3 | Add and backfill immutable `branch_id`; states are 2 `PENDING`, 1 `PAYMENT_EXPIRED` |
| `appointment_items` | 3 | Not rewritten; new trigger validates branch offering/staff eligibility on future item writes |
| `customers` | 21 | No row backfill; 2 Auth-linked, 19 guest/unlinked; add immutable Auth-link guard |
| `payments` / `refunds` | 1 / 0 | Not rewritten; branch remains derived through appointment; the one payment is `PENDING` |
| `guest_access_tokens` | 11 | Not rewritten; remain attached to existing appointment IDs |
| `appointment_home_locations` | 0 | Not rewritten; no current destination rows |
| `audit_logs` | 99 | Add and backfill `branch_id`; audit history/timestamps are protected by temporary trigger suppression |

The migration derives the default branch from the single business settings row (`Main Branch`, slug `main`), copies business address/contact/timezone/Home Service origin and coverage, and initializes `public_visible` and `booking_enabled` from `published`. It creates branch booking settings from `booking_approval_mode`. Since the business is published, the initial branch is expected to be active, public-visible, and bookable. The current global guest and registration settings remain business-wide.

## 3. Phase 1 report review and live compatibility

The Phase 1, Phase 1.1, and Phase 1.1B reports were reviewed alongside the complete local migration. Prior local evidence is clearly labeled as PGlite/isolated E2E and is not treated as managed PostgreSQL verification.

No current live table/type/extension/constraint/trigger-name mismatch was found in the read-only comparison. The live state also satisfies the migration’s guarded backfill precondition: one business settings row exists and all currently non-empty operational tables can be attributed to that single default branch. The three service rows produced zero rows that fail the migration’s effective branch-service payment guard check.

The following behavior remains **unverified until migration execution**: composite FK validation against every historical row, exact audit snapshot preservation, constraint rebuild success, PostgreSQL lock duration, migration-runner transaction semantics, and post-migration RLS/function behavior. The local Phase 1 migration file contains no explicit `BEGIN`/`COMMIT` delimiters, and the available `apply_migration` tool description does not state its transaction boundary. This must be confirmed for the selected runner because the migration temporarily disables 16 triggers and later reenables them.

## 4. Recovery/export assessment — waived by owner for this DEV/TEST apply

The organization is on the **Free** plan. Supabase's [database backup guide](https://supabase.com/docs/guides/platform/backups) describes the managed backup options by plan. No project backup artifact or restore result was inspected or created. Supabase MCP exposes no dump/export operation and no read-only backup inventory operation. Its `restore_project` tool is mutating and was not called. No development branch is listed for this project. The owner has now explicitly waived a backup and restore rehearsal for this disposable DEV/TEST migration, so these limitations are accepted and are not a migration blocker.

### Export paths investigated

| Path | Verified behavior and limitation | Available here? |
|---|---|---|
| Supabase MCP | The available MCP functions cover table/schema/migration queries, SQL execution, migration application, and project restore. There is no suitable full-database export or Storage-object export tool. A series of `SELECT` results is not a consistent backup and omits a portable catalog/DDL archive. | **No** |
| Supabase Management API backup inventory | Supabase documents [`GET /v1/projects/{ref}/database/backups`](https://supabase.com/docs/reference/api/v1-list-all-backups), requiring `database:read` / `backups_read`. This lists backup metadata; it does not create a logical export or include Storage object bytes. The current MCP tool catalog has no list-backups operation, and no approved raw Management API call path with that scope was available for this assessment. | **Not callable here; no result inspected** |
| Supabase CLI `db dump` | The [CLI reference](https://supabase.com/docs/reference/cli/supabase-db-dump) says it runs `pg_dump` in a container, excludes Supabase-managed `auth` and `storage` schemas by default, and omits data and custom roles by default. It would require Docker here and explicit scope/options, so it does not meet the no-Docker/full-backup requirement as currently configured. | **CLI 2.118.0 is installed locally**, but Docker is unavailable and must not be installed for this task; therefore this dump route is unusable here. |
| Direct PostgreSQL client | Supabase documents direct `pg_dump` using a database connection and a role with enough privileges. PostgreSQL 17 `pg_dump` guarantees a consistent database snapshot even while the database is in use. A full dump must include the relevant application and managed schemas (including `auth`, `storage`, and `supabase_migrations`) and required extension declarations/configuration. | **No** — `pg_dump`, `pg_dumpall`, and `psql` are not on PATH; no approved direct connection credentials are available in the session. Environment variable names were checked without reading any values; no DB connection variable or Supabase access token is present. The passwordless CLI migration-history probe failed while initializing a temporary login role; see Section 6. |

The missing capability is a **safe, authorized recovery/export path**: PostgreSQL 17-or-later client tools (`pg_dump`, `pg_restore`, and `pg_dumpall` or another approved role/global capture method where permitted), an approved connection and role/password with sufficient catalog and row access, a compatible isolated PostgreSQL restore target, and a protected off-project destination. The CLI package is installed, but its `db dump` requires a container; the standalone PostgreSQL clients are absent. If the owner also wants to inspect managed backup metadata, the required read-only Management API operation needs `database:read` / `backups_read`; it is not exposed in the current MCP catalog. Supabase's documented least-privilege `backup_reader` approach requires creating a role with `BYPASSRLS`, granting `pg_read_all_data`, and setting read-only-by-default; that setup is a remote database change and was not performed because remote writes are expressly prohibited in this phase. An existing authorized database owner connection could be used instead if available through the approved secure channel. No credential or token was requested or printed.

### Scope needed for recoverability

- [`pg_dump`](https://www.postgresql.org/docs/17/app-pgdump.html) creates a consistent snapshot for **one database**, but does not capture cluster-global roles/tablespaces. PostgreSQL documents [`pg_dumpall --globals-only`](https://www.postgresql.org/docs/17/app-pg-dumpall.html) for those objects and notes that complete global dumps generally require superuser-level access. Supabase's [pg_dump guidance](https://supabase.com/docs/guides/troubleshooting/pg_dump-fails-with-query-would-be-affected-by-row-level-security-policy-1d5783) notes role passwords are not included; any required custom role passwords must be reset securely after restore. This session has no evidence that an approved role can export/restore all required managed and custom role/global state, so that permission must be confirmed before describing the recovery set as complete.
- Include Auth database records (`auth`, including user/authentication records) and migration history (`supabase_migrations`) in a direct full database dump. This archive contains sensitive customer/Auth information and must be encrypted, access-restricted, and never printed or committed. Supabase's guidance says `backup_reader` can read all schemas including `auth` and `storage` when correctly provisioned.
- Storage's `storage` schema holds bucket/object metadata, but the actual file bytes live outside Postgres. The [Storage schema guide](https://supabase.com/docs/guides/storage/schema/design) states the metadata and object bytes are separate. Therefore a database dump alone cannot restore logos, hero images, or other bucket objects. A separate authorized object export plus manifest/verification is required. No Storage export capability was exposed here. Coordinate the object copy with a write freeze or another method that ensures the metadata/object set is coherent.
- Required extensions are represented by extension declarations and platform capabilities, not a portable copy of the managed extension binaries. The restore target must support the required versions and ownership assumptions; verify `btree_gist` and `pgcrypto` before restore. Include any extension configuration data required by the extension.
- A `pg_dump` plus global-role capture plus object-byte export is a multi-part recovery set, not one atomic cross-service snapshot. Freeze database DDL/role changes and Storage mutations during capture, record scope/timestamps/versions/checksums, then validate restore and row/object inventories. Do not call a collection of read queries a substitute.

### Recovery test availability

The Free project has no verified managed backup/recovery point. Supabase's [backup guide](https://supabase.com/docs/guides/platform/backups) documents the read-only [`List all backups` API](https://supabase.com/docs/reference/api/v1-list-all-backups), requiring `database:read` / `backups_read`; the current connected tools do not expose that call, so the actual backup list remains unknown. Supabase's [restore-to-new-project guide](https://supabase.com/docs/guides/platform/clone-project) describes a database-only clone, says Storage objects/settings and several project settings need manual reconfiguration, and states the feature is exclusive to paid plans. That option is not available under the user's no-paid-plan constraint. No isolated PostgreSQL/Supabase restore target is configured or present in the current tools. A restore into the live project is not an acceptable validation and was not attempted.

**Recovery waiver:** no backup was created, no complete export was available, and no isolated restore was performed. This is recorded for recovery planning but is not a blocker under the owner's updated DEV/TEST instructions. No reset, truncate, or intentional data deletion was authorized or performed.

## 5. Migration transaction plan and expected changes

### Exact SQL file

`supabase/migrations/20261007120000_multi_branch_phase_1_foundation.sql`  
SHA-256: `DD537A206003F3BC17A3C7AAF12643D63EB8F3D465ACFC7ABDDDBF819CF283E1`

Only this exact reviewed file should be applied. Recompute and compare the hash immediately before any later approved operation. Do not run earlier migrations again or use `db reset`/`reset_branch` against the existing project.

### Migration transaction safety (Phase 1.2C)

The available `supabase_apply_migration` MCP tool is the execution path considered in the prior readiness report. Its tool description says it applies a migration but says nothing about transaction boundaries. The published [Supabase MCP implementation](https://github.com/supabase/mcp/blob/main/packages/mcp-server-supabase/src/tools/database-operation-tools.ts) delegates to `database.applyMigration(project_id, { name, query })`; the [Management API reference](https://supabase.com/docs/reference/api/v1-apply-a-migration) documents a single POST with `query`, optional `name`, and optional `rollback`, but does not document a whole-file transaction guarantee. The connected tool's backend adapter/Management API implementation is not exposed for inspection. A single HTTP request is not proof that SQL execution and migration-history recording are atomic. No migration was executed to probe this behavior. **Conclusion: whole-file atomicity for the available MCP path is unverified; do not use it for this migration.**

Supabase's current [CLI migration workflow documentation](https://supabase.com/docs/guides/local-development/cli-workflows) documents that `db push`, `db reset`, and `migration up` wrap each migration file in a transaction by default, and honor the `-- pg-delta: transaction=false` directive to disable that wrapper. With that directive, earlier statements in a failed migration can remain applied. The reviewed Phase 1 file has no explicit `BEGIN`/`COMMIT` and no `transaction=false` directive. It does disable 16 existing triggers at lines 434–449 and reenables them at lines 468–483, so a confirmed per-file transaction is essential: a failure must roll back the disable operations as well as the backfill/DDL. The file's statements do not request a non-transactional directive. This conclusion is based on the documented CLI runner behavior, not a trial execution against DEV/TEST.

**Required runner:** use the installed local Supabase CLI 2.118.0 with `db push --linked --skip-vault` against the verified target. CLI help confirms `--password`, `--dry-run`, and `--skip-vault`; it also warns that Vault secrets from `config.toml` are updated before migrations unless `--skip-vault` is set. First run the dry run using an owner-approved database password supplied locally through a secure channel. Proceed only if it lists this single migration and no other pending file; stop if it lists anything else. The dry run previews pending files; it does not execute or validate their SQL. Remote `db push` does not require starting the local Docker stack. Keep the migration free of a `transaction=false` directive, do not add manual transaction delimiters, and verify the remote migration history plus all 16 trigger states afterward. The local CLI is linked to the correct project, but this session has no database-password key in its environment or `.env.local`; remote connection by the passwordless temporary login-role path is excluded because the prior `migration list` probe failed during that role-initialization step and the role's pre-probe state is unknown. No password or token was requested or printed. This is a documented workflow, not a dry run or migration execution.

If the MCP `apply_migration` runner is required instead, first obtain authoritative Supabase documentation or implementation evidence for its transaction and failure rollback semantics, including whether the migration history row is committed with the SQL. Until then it remains unsuitable for the trigger-disable migration. Do not test atomicity against DEV/TEST.

### Expected changes and authorization

1. Create the five branch/configuration/membership/assignment tables, indexes, constraints, RLS policies, and payload-free invalidation/audit triggers.
2. Add `branch_id` to booking-policy versions, staff-service links, business hours, closures, staff hours, exceptions, appointments, and audit logs; add `is_global` to staff exceptions.
3. Backfill one default branch and attribute the historical records counted above. Create 3 staff assignments, 3 service offerings, and zero Admin memberships for the current role inventory. Preserve appointment/payment/refund/token IDs and relationships; payments continue to derive branch through appointments.
4. Rebuild branch-sensitive unique/exclusion constraints and add composite foreign keys. Keep `appointments_no_staff_overlap` global by staff/time.
5. Temporarily disable only the 16 listed historical timestamp/audit/immutability triggers during attribution updates, then restore all of them before constraint validation/completion. Stop if the migration errors; do not manually mark history applied or retry over uncertain partial state.
6. OWNER remains cross-branch and does not require membership. ADMIN access requires the current ADMIN role, active membership and AAL2; role changes/membership operations remain OWNER-authorized. STAFF receives assignments matching its current profile activity; no self-assignment. CUSTOMER `auth_user_id` stays immutable through profile changes and privileged update paths, except Auth-user deletion cleanup.
7. Preserve existing single-branch booking: branch config mirrors the published state, hours/services/staff resolve through the default branch, and new bookings must use its active assignment/offer. Public visibility must remain gated by the branch’s active/public/bookable flags. No second active branch is enabled.

### Operational risks and window

The migration performs `ALTER TABLE`, drops/adds constraints (including GiST exclusions), validates new foreign keys, creates indexes, and updates 99 audit rows. Table counts are small, but row counts do not estimate lock waits or concurrent traffic. `ALTER TABLE` and constraint operations acquire locks that can block writes; schedule a low-traffic maintenance window, pause booking/admin writes during the migration, and monitor lock duration. Do not promise zero downtime.

For the already owner-authorized migration, use the documented transaction-wrapping Supabase CLI runner described in Section 5 after its dry-run gate is satisfied. Do not apply this file using the currently connected MCP `apply_migration` path while its transaction behavior remains undocumented. If command outcome is uncertain, stop and inspect migration history and trigger state read-only; do not retry an uncertain execution.

### Post-migration verification

After the owner-authorized CLI apply completes, verify before reopening normal writes:

- Migration history contains exactly `20261007120000` once and no later unexpected version.
- One active default branch exists; public/booking flags and copied timezone/settings match the business row.
- Counts match: 3 staff assignments, 3 branch offerings, 1 attributed policy, 6 service links, 6 business-hour rows, 18 staff-hour rows, 3 appointment rows, 99 audit rows; 0 closures/exceptions/refunds/home locations; retain 3 items, 1 payment, 11 guest tokens, and 21 customers.
- Every branch attribution is non-null where required; global exceptions are only `UNAVAILABLE`; all composite FKs and exclusions are validated.
- All 16 intentionally suppressed triggers are enabled again; new branch triggers are installed; all expected RLS policies and function EXECUTE grants match the reviewed migration.
- CUSTOMER identity/contact grants, Owner/Admin MFA boundaries, staff assignment boundaries, public published/bookable projections, appointment overlap, availability, booking lifecycle, payment links, guest-token access, and Home Service privacy pass the approved verification matrix.
- Re-run read-only schema/migration checks and the application’s authorized smoke checks. No live Auth/MFA equivalence should be claimed from SQL role/JWT simulation alone.

### Recovery procedure

No backup or restore rehearsal is required for this owner-approved DEV/TEST change. If the migration command fails or returns an uncertain result, stop application writes and retries, capture the error, and check migration history and all 16 trigger states read-only. Do not use a destructive down migration, database reset, or manual edit of `schema_migrations`. The CLI per-file transaction should roll back a SQL failure; if the result is ambiguous, stop and report it instead of retrying. The owner accepts the test-data recovery limitation, but that does not authorize intentional deletion.

There is no verified restore path; this is an accepted owner-waived limitation for the disposable DEV/TEST project.

## 6. Approval boundary and execution result

### Phase 1.2 execution preflight — 2026-10-08

**Owner authorization:** Apply only Phase 1 to the named DEV/TEST project. Backup and restore rehearsal are waived. The authorization does not allow reset or intentional deletion. No production project was accessed.

| Preflight item | Result |
|---|---|
| Target identity | Supabase project ID/ref `obpyyjewnsygkxobyunw`, name `Appointment Booking System`, status `ACTIVE_HEALTHY`, region `ap-southeast-1` |
| Database compatibility | PostgreSQL 17.6.1.171 / engine 17 |
| Migration history | Read-only MCP inventory: 26 applied migrations through `20261006083804`; Phase 1 is absent |
| Local migration set | Local timestamped files match those 26 remote versions plus the intended `20261007120000` migration; this suggests one pending file but does not replace the required CLI dry run |
| Required extensions | `btree_gist` 1.7 and `pgcrypto` 1.3 installed |
| New branch schema | All five Phase 1 tables absent before migration |
| Temporarily suppressed legacy triggers | 16/16 present and normally enabled before migration |
| Current backfill source counts | 1 business settings row; 1 OWNER, 0 ADMIN; 3 staff; 3 services; 1 policy version; 6 staff-service links; 6 business-hour rows; 18 staff-hour rows; 3 appointments/items; 21 customers; 1 payment; 0 refunds; 11 guest tokens; 99 audit rows |
| Migration integrity | SHA-256 `DD537A206003F3BC17A3C7AAF12643D63EB8F3D465ACFC7ABDDDBF819CF283E1`, matching the reviewed Phase 1 artifact; no top-level reset/truncate/drop-table or data-deletion statement found. A schedule-save RPC defined by the migration contains a scoped DELETE for its normal runtime behavior; it was not invoked. |
| Transaction boundary | Confirmed from current Supabase CLI documentation: `db push` wraps each migration in a transaction by default unless `-- pg-delta: transaction=false` is present. This migration has no such directive. The 16 trigger disables and re-enables are covered by that per-file transaction. |
| CLI target | Project-local CLI 2.118.0 is installed and its linked project ref matches the target |
| CLI credential path | No database-password key in the current process environment or `.env.local`. The prior passwordless CLI history probe entered temporary login-role initialization and failed with a transport error; it was not repeated. The pre-probe role state remains unknown. |
| Required dry run | **Not run.** No secure password-authenticated CLI path is configured. The passwordless remote path risks repeating the previously observed temporary-role behavior. |
| Isolated database suite | `npm run test:db` PASS — 645 checks, including 113 Phase 1 migration/backfill/bootstrap/authorization checks in PGlite. This is isolated local verification only, not live migration verification. |
| Remote writes | As of this earlier CLI-only preflight, none had been performed. The final MCP execution and its outcome are recorded in Section 7. |

**Historical CLI-only status (superseded by Section 7):** At the end of the earlier assessment, Phase 1 had not been applied because a CLI dry run was unavailable without risking the previously observed login-role path. The current owner request allowed MCP execution instead. No database reset or CLI migration attempt was made.

### Phase 1.2 final controlled execution and verification — 2026-10-08

The target was confirmed as the active DEV/TEST project `obpyyjewnsygkxobyunw` (PostgreSQL 17.6.1.171). Before application, read-only MCP checks showed 26 migrations through `20261006083804`, no Phase 1 branch tables, the required extensions installed, and all 16 legacy triggers enabled.

#### MCP transaction path

The available `apply_migration` tool forwards SQL to Supabase's Management API; its tool contract does not document transaction behavior. I used the connected `execute_sql` tool with one explicit PostgreSQL batch instead. A harmless transaction probe confirmed that the API accepts multiple statements between `BEGIN` and `ROLLBACK`; a temporary migration-history insert was visible inside that transaction and absent after rollback. The connection ran as `postgres` and had the required DDL and history-table privileges.

The first guarded application attempt stopped in the post-migration validation block because my PL/pgSQL validation variable shadowed a table alias. No `COMMIT` or history insertion was reached. Read-only MCP verification immediately afterward found all five branch tables absent, history still at 26 entries, and zero disabled legacy triggers. I corrected the validation alias and reran the same migration source in one explicit transaction. The migration, postflight validation, and history-row insertion succeeded before `COMMIT`.

#### Committed database state

| Verification | Result |
|---|---|
| Migration history | 27 total entries; `20261007120000_multi_branch_phase_1_foundation` appears exactly once. |
| Branch model | Five new tables exist with RLS enabled: one active default branch, one branch booking-settings row, three branch service offerings, zero Admin memberships (the project has no ADMIN role), and three staff assignments. |
| Historical backfill | Existing booking policy, staff-service, business-hours, closure, staff-hours, exception, appointment, and audit rows passed branch-attribution checks. Payments remain associated through their appointments. |
| Record preservation | The in-transaction comparison found no row-count changes across the existing public tables. Live counts afterward include 21 customers, 3 appointments, 3 appointment items, 1 payment, 11 guest tokens, 6 appointment events, 7 notification-outbox rows, and 99 audit rows—the same pre-migration counts. |
| Legacy triggers | All 16 temporarily disabled triggers are enabled. No legacy trigger remains disabled. |
| New triggers | Customer-linkage, membership, staff-assignment, appointment-branch guards and all five branch realtime invalidation triggers are enabled. |
| RLS and policies | RLS is enabled on every new branch table and every Phase 1-affected public table; each has policies. Catalog checks returned the expected policies (1–5 per table). |
| Function and identity permissions | Anonymous access to branch-admin/staff helpers and the internal availability function is denied; authenticated/service-role helper grants match the migration. Anonymous public-branch projection is executable. Authenticated users cannot update `customers.auth_user_id`; its guard trigger is enabled. |
| Booking overlap | The global `appointments_no_staff_overlap` exclusion constraint is present and validated. |
| Live availability | The branch-aware availability function returned 600 candidate slots across 36 service/date combinations in the next 14 days. |
| Guest booking path | The service-role `server_public_booking_submit` RPC accepted a synthetic guest booking in a transaction that was deliberately rolled back. No customer, appointment, event, guest token, or outbox row persisted; post-rollback counts matched the committed state. |
| Local database regression suite | `npm run test:db` passed all 645 checks, including 113 Phase 1 migration, backfill, bootstrap, and authorization checks in PGlite. This is isolated local test evidence, separate from the live MCP checks. |

The raw MCP `execute_sql` transaction was used because its explicit `BEGIN`/`COMMIT` behavior was verified. The migration-history row was inserted only after the migration and in-transaction schema, backfill, RLS, trigger, permission, and booking-constraint checks passed; it committed in the same transaction as the schema changes. No incomplete schema was marked applied.

The live guest booking check exercised the database RPC in a rollback-only smoke test; it did not exercise the Next.js HTTP rate-limit layer, a signed-in customer session, payment-provider processing, or an ADMIN/STAFF live session. No users or credentials were created or requested. No production project was accessed. No backup, reset, CLI, commit, push, or deployment was performed.

**PHASE 1.2 PASSED — DEV/TEST MIGRATION VERIFIED**


