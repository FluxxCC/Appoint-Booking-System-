# Multi-Branch Phase 1.2 — Isolated PostgreSQL Migration Verification

**Review date:** 2026-10-07  
**Status:** BLOCKED — required isolated PostgreSQL execution environment is unavailable.  
**Scope:** Read-only repository and remote migration-history inspection; no migration rehearsal was run.

## 1. Executive summary

Phase 1.2 cannot receive a PASS. The required independent PostgreSQL rehearsal could not start because this host has no Docker CLI/installation, PostgreSQL binaries, PostgreSQL Windows service, or Supabase CLI on PATH. The brief explicitly says to stop execution when Docker or suitable local PostgreSQL is unavailable and forbids substituting PGlite. No migration SQL or test suite was executed for this phase.

A read-only Supabase migration-history query confirmed that the target migration `20261007120000_multi_branch_phase_1_foundation` is not applied to DEV/TEST. The latest remote history entry is `20261006083804` (website appearance). No remote schema or data query/change was performed.

The prior Phase 1.1/1.1B PGlite, unit, E2E, lint, typecheck, and build results remain historical evidence only. They do not establish PostgreSQL migration compatibility and are not counted as Phase 1.2 verification.

## 2. Environment details

| Item | Evidence / result |
|---|---|
| Host | Windows, PowerShell; review date 2026-10-07 |
| Docker | `docker` command not found; no Docker service/installation detected in the checked host locations |
| PostgreSQL | `psql`, `postgres`, `initdb`, and `pg_ctl` not found on PATH; no PostgreSQL service detected |
| Supabase CLI | `supabase` command not found on PATH |
| Local Supabase stack | Unavailable because Docker and CLI prerequisites are absent |
| Configured database major | `supabase/config.toml` specifies PostgreSQL major version 17 |
| Last recorded hosted PG version | The Phase 0 audit reports DEV/TEST PostgreSQL 17.6 as of 2026-10-07. This was historical documentation; the exact current hosted version was not freshly queried in this phase. |
| Required extensions in migration chain | `btree_gist` in schema `extensions` (foundation migration) and `pgcrypto` in schema `extensions` (public booking migration) |
| Other database dependencies | Supabase `auth` schema and `auth.uid()`, Supabase roles/JWT claim settings, RLS, range/GiST exclusion support, and the existing migration chain |
| Isolated database created | No |
| PGlite used as substitute | No |

The expected extension list above is derived from migration source, not from a live PostgreSQL extension inventory. No live extension state was inspected.

## 3. Repository and migration-history inspection

The required architecture audit, implementation plan, Phase 1 report, Phase 1.1 review, Phase 1.1B review, Supabase configuration, target Phase 1 migration, and migration inventory were inspected. Migration DDL/security dependency patterns were searched across the migration chain. This source review did not execute PostgreSQL and is not a semantic migration rehearsal.

A read-only Supabase migration-list operation was run against project `obpyyjewnsygkxobyunw` (Appointment Booking System). It returned 26 entries, from `20260929123406` through `20261006083804`. The target `20261007120000` was absent. Therefore, the target migration remains unapplied remotely as of this check.

No `supabase db push`, `supabase db reset`, `apply_migration`, SQL execution, remote database reset, or remote write was performed. No production project was accessed.

The Git worktree already contained unrelated Phase 0/1 files and changes. They were preserved. This phase changed only this report; no application source, migration SQL, test, or configuration file was edited. Nothing was staged or committed, and nothing was pushed or deployed.

## 4. Existing-business migration results

**NOT RUN — BLOCKED.** No disposable PostgreSQL database was available, so no synthetic existing-business dataset or pre-migration snapshot was created. The migration was not applied.

The following checks therefore have no Phase 1.2 result:

- Default-branch creation and historical attribution
- ADMIN memberships and STAFF assignments
- Appointment identity, lifecycle, timestamp, and snapshot preservation
- Payment/refund links and guest access-token preservation
- Audit history preservation and trigger restoration
- Foreign keys, constraints, row counts, duplication, or loss

The preceding PGlite report describes prior local fixture checks, but those are not reclassified as this PostgreSQL scenario.

## 5. Fresh-install results

**NOT RUN — BLOCKED.** The complete migration chain was not applied to an empty PostgreSQL database. Initial-business setup, default-branch creation, OWNER/ADMIN membership behavior, STAFF assignment behavior, public visibility, MFA gates, and single-branch compatibility remain unverified by Phase 1.2.

## 6. Data-integrity comparisons

**NOT RUN — BLOCKED.** No before/after database snapshots or PostgreSQL row-level comparisons were available. This phase makes no claim about PostgreSQL backfill correctness, transactional preservation, constraint validation, or historical data equivalence.

## 7. Authorization and RLS test matrix

All results below are **NOT RUN — BLOCKED** because actual PostgreSQL roles, grants, RLS, and JWT-claim simulation were not available in an isolated PostgreSQL instance.

| Actor / boundary | Required checks | Phase 1.2 result |
|---|---|---|
| OWNER | AAL2/MFA; cross-branch authority; global leave; membership and assignment management | Not run |
| ADMIN | Current role, active membership, MFA; branch boundaries; no global leave or self-grant | Not run |
| STAFF | Active role/profile/assignment; appointment scope; no payment/report or assignment privilege | Not run |
| CUSTOMER | Own data only; no Auth identity reassignment or other-customer private data | Not run |
| ANON / GUEST | Public visibility gates; appointment-scoped guest access; no private RPC access | Not run |
| `service_role` | Intended backend workflows; ownership immutability; trusted assignment guard; explicit bypass boundaries | Not run |
| Function and schema ACLs | EXECUTE grants, schema exposure, SECURITY DEFINER behavior, default privileges | Not run |

Simulated claims, even when later exercised locally, will not prove equivalence to a managed Supabase Auth session; that limitation must remain explicit in any future report.

## 8. Booking and payment regression results

**NOT RUN — BLOCKED.** No PostgreSQL checks were run for single-branch booking, availability, schedule constraints, staff overlap, booking approval/cancellation, payment transitions, webhook idempotency, refunds, Home Service privacy, published-site behavior, or Admin dashboard RPC compatibility. No PayMongo, Resend, or SMS providers were called.

## 9. Migration failure and recovery results

**NOT RUN — BLOCKED.** There was no disposable database in which to inject a failure or observe transaction rollback, partial schema state, error clarity, restoration, or migration-history consistency. No destructive down migration was designed or run.

### Proposed DEV/TEST recovery runbook (not exercised)

1. Before any future controlled DEV/TEST window, verify the target project and migration history, capture and validate a recoverable pre-migration backup/snapshot, and record the migration file hash.
2. Apply only after the isolated rehearsal passes and the release owner authorizes the change. Capture migration output and post-migration history/schema evidence.
3. If application fails, stop further writes/retries. Inspect transaction outcome and migration history using a read-only connection. Do not attempt an improvised down migration.
4. If schema/data integrity is uncertain, restore the verified pre-migration backup using the approved project recovery process, then validate application health and migration history before reopening writes.
5. Rehearse this restore path in an isolated database before treating it as an operationally verified recovery procedure.

This is guidance only; neither backup restoration nor the runbook was tested here.

## 10. Remaining risks and limitations

- PostgreSQL behavior, version compatibility, extension availability, and migration transactionality remain unverified.
- No populated-database backfill, fresh-install path, PostgreSQL ACL/RLS behavior, failure injection, or recovery procedure was exercised.
- Historical DEV/TEST metadata in the Phase 0 audit says PostgreSQL 17.6; the actual current managed version was not freshly queried.
- The migration list was verified read-only, but no managed database schema, role, extension, Auth, Storage, Realtime, or application-session behavior was inspected in this phase.
- Earlier PGlite/CI-like results cannot cover PostgreSQL-specific DDL, locks, role semantics, extension behavior, Supabase Auth, or PostgREST request settings.

## 11. DEV/TEST migration readiness

**BLOCKED — not ready for a controlled DEV/TEST migration review.** The target migration is confirmed unapplied, but readiness requires the exact PostgreSQL rehearsal demanded by Phase 1.2. The missing prerequisite is a disposable local PostgreSQL 17 environment or isolated Supabase local stack with Docker, the required extensions, Supabase-compatible schemas/roles, and a way to run the complete migration chain and integration checks.

Once that environment is available, resume from this report without changing the remote project: run the populated existing-business and fresh-install scenarios, the authorization/operational matrix, migration failure/recovery checks, PostgreSQL-specific integration tests, and the requested project validations. Record actual outputs and versions; do not infer results from prior PGlite runs.

## 12. Explicitly unverified managed-Supabase behavior

No live session, Auth login, MFA, PostgREST request, Realtime delivery, Storage request, or managed database SQL was tested. The read-only migration inventory only establishes the migration versions reported by the connected project at query time. It does not establish current server version, extension state, policy behavior, schema exposure, function ACLs, backup recoverability, or runtime compatibility.

**PHASE 1.2 BLOCKED — CORRECTIONS REQUIRED**
