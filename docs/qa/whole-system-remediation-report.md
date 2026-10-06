# Whole-System Controlled Remediation Report

**Date:** 2026-10-06 (Asia/Manila)\
**Branch / HEAD:** `main` / `72e0330a670c1c1622d8c502afcd5c25eeeabc3e`\
**Scope:** The confirmed P2 finding, with P3 and P4 retained as already-fixed regression checks.

## 1. Starting findings

| Severity | Starting count | Finding |
|---|---:|---|
| P0 | 0 | None |
| P1 | 0 | None |
| P2 | 1 | Missing `appearance_media_admin_insert` Storage policy |
| P3 | 1 | React Hooks lint error in shared shell navigation |
| P4 | 1 | Unused `Link` import in the admin error boundary |

The previously investigated 25 E2E failures remain classified as harness/environment or stale-expectation failures. No application behavior was changed to address those resolved failures.

## 2. P2 remediation

**Status: FIXED + VERIFIED.** The user confirmed the exact target as a development/test project, and migration `20261005094639_admin_website_appearance.sql` was applied once to that project. The resulting remote version is `20261006083804`, recorded with migration name `20261005094639_admin_website_appearance`. The local file is now `supabase/migrations/20261006083804_20261005094639_admin_website_appearance.sql` so local and remote migration versions align; its SQL content was unchanged. Combined evidence includes live policy/RLS checks, isolated OWNER/ADMIN app workflows, database authorization tests, and the user's manual live OWNER upload/replacement smoke test below.

The migration creates `appearance_media_admin_insert` on `storage.objects` for the existing `catalog-images` bucket and allows authenticated users only when `private.is_admin()` is true and the object name matches `appearance/logo/<uuid>.webp` or `appearance/hero/<uuid>.webp`. The live guard requires an active user, MFA assurance `aal2`, and OWNER or ADMIN role. The migration also replaces `private.catalog_image_unreferenced(text)` to protect logo and hero paths referenced by `public.website_settings`, retaining the admin guard, empty search path, schedule lock, and service/staff reference checks. It is forward-only and contains no table/data rewrite, `DROP`, or `TRUNCATE`.

## 3. Supabase project verification

**Project identity: matched. Development/test environment: explicitly confirmed by the user.**

- Supabase project name: `Appointment Booking System`
- Project ID/ref: `obpyyjewnsygkxobyunw`
- Region/status: `ap-southeast-1` / `ACTIVE_HEALTHY`
- Remote migrations after remediation: 26; the appearance migration is present as version `20261006083804` and name `20261005094639_admin_website_appearance`

Only this confirmed project was used. The migration API assigned the current remote version; the local migration filename was aligned to that version. No other migration was applied.

## 4. Migration status

- Migration applied: **YES, once** to `obpyyjewnsygkxobyunw`
- Remote migration history read back: **YES**; version/name match the renamed local migration
- Migration drift from this finding: **NO**
- Unrelated pending migrations applied: **NO**

## 5. Live Storage policy verification

A fresh read-only catalog query confirmed:

- `storage.objects` RLS: enabled
- `catalog-images`: public read, `image/webp` only, 2,097,152-byte size limit
- Existing `catalog_media_admin_insert`: authenticated role, protected by `private.is_admin()`, service/staff catalog path restriction
- `appearance_media_admin_insert`: present exactly once, command `INSERT`, role `authenticated`, bucket restriction `catalog-images`, admin/MFA predicate, and appearance logo/hero path restriction
- Broader catalog upload access added: no

The existing `catalog_media_admin_insert` still covers only service/staff catalog paths; no UPDATE policy was added. The bucket remains public-read, WebP-only, and capped at 2,097,152 bytes. Live `storage.objects` RLS remains enabled.

## 6. Appearance upload verification

- **LIVE VERIFIED:** the confirmed DEV/TEST project, aligned migration history, `appearance_media_admin_insert`, enabled Storage RLS, live anonymous/CUSTOMER denials, invalid-path denials, and cleanup-reference predicate checks were verified in the earlier controlled checks. Live OWNER metadata authorization checks for logo and hero passed inside transactions that were rolled back.
- **DATABASE/RLS VERIFIED:** isolated database fixtures allow OWNER/ADMIN appearance inserts and deny anonymous/CUSTOMER/STAFF; they cover valid and invalid path forms and cleanup/reference protection. The complete database suite passed 532 checks.
- **ISOLATED E2E VERIFIED:** OWNER and ADMIN workflows upload logo and hero, preview, save, persist through refresh, render publicly, replace prior media, and recover from upload errors. Focused appearance E2E: **2 passed**; full E2E: **34 passed, 0 failed, 0 flaky, 0 skipped**. These byte transfers used the isolated local Supabase stub.
- **MANUAL OWNER VERIFIED (user-reported):** OWNER login + MFA passed on the real DEV/TEST deployment. Logo and hero uploads succeeded through the real application, persisted after refresh, and rendered on the public site. Logo and hero replacements succeeded and persisted after refresh. The agent did not repeat the uploads.
- **ADMIN/STAFF live sessions:** not verified. The project has no ADMIN or STAFF login accounts; none were created solely for testing. ADMIN UI behavior is covered by isolated E2E; STAFF denial by isolated authorization fixtures. No live ADMIN/STAFF session verification is claimed.
- **Replacement/cleanup:** isolated E2E replaced image A with image B and cleaned A while protecting current B. Live rollback-only checks confirmed `private.catalog_image_unreferenced` protects referenced logo/hero paths and marks unreferenced paths eligible for cleanup. The manual OWNER smoke test separately verified live logo and hero replacement.

The automated live authorization checks used metadata inserts and setting/reference changes inside transactions that were rolled back. The agent did not alter live roles or branding. The Storage database trigger rejected direct SQL deletion and instructed use of the Storage API; isolated E2E exercised cleanup through the app's Storage client. The current live appearance object count is not asserted after the user's manual uploads.

## 7. P3 remediation

**Status: FIXED + VERIFIED.** `src/components/layout/shell-nav.tsx` no longer copies localStorage-derived badge data into React state from an effect. The component now uses `useSyncExternalStore` with server/client snapshots and a localStorage-backed store plus a session-memory fallback. Acknowledged request IDs remain scoped by user and route; clicking the appointment link updates the badge immediately, refresh retains the seen state, and later request IDs remain unread. Role navigation, mobile/desktop navigation, and the existing realtime/fallback refresh path remain in place.

Regression coverage in `tests/e2e/phase-7-booking.spec.ts` verifies owner, ADMIN, staff, and customer visibility; click-to-clear; refresh persistence; a newly arriving request; and per-user seen state. The focused badge test passed, and the final full E2E suite passed.

## 8. P4 remediation

**Status: FIXED + VERIFIED.** Removed the unused `Link` import from `src/app/(admin)/admin/error.tsx`. No other error-page redesign was made for this finding.

## 9. ESLint configuration

Updated `eslint.config.mjs` to globally ignore `.next*/**` and `test-results*/**`. Application source and tests remain in ESLint scope. Targeted lint for the two application files and the new E2E case passed; full `npm run lint` passed without findings.

## 10. Regression results

| Verification | Final result |
|---|---|
| Targeted ESLint | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | 138 passed / 0 failed |
| `npm run test:db` | 532 checks passed / 0 failed |
| Focused appearance E2E | 2 passed |
| `npm run test:e2e` | 34 passed / 0 failed / 0 flaky / 0 skipped |
| `npm run build` | PASS (isolated output; Next.js 16.3.7 Turbopack) |

The E2E run used the isolated local Supabase stub and a dedicated build/output directory. It covered booking, Home Service, lifecycle/payment, owner/admin/staff/customer workspaces, responsive navigation, badge behavior, and the new appearance upload flow. Expected local-stub diagnostics include Realtime WebSocket 404s, aborted in-flight RSC requests, and the deliberately simulated availability 503.

## 11. Remaining known issues

- P2, P3, and P4 are fixed and verified. The user's manual live OWNER smoke test closes the live upload/replacement evidence gap for P2.
- The separate prior security review's leaked-password-protection configuration observation remains outside this bug-remediation scope.

## 12. Remaining environment limitations

- The live project has one OWNER and no ADMIN or STAFF role accounts. ADMIN/STAFF were verified through existing isolated test fixtures; no live user role was altered.
- The user's manual OWNER smoke test verifies byte upload, refresh persistence, public rendering, and replacement against the real live application. It is recorded as user-reported manual evidence and was not repeated by the agent.
- No real email, payment provider, or account role was changed by the agent. The current live appearance object count is not asserted after the user manual smoke test.

## 13. Final quality verdict and worktree report

**P2:** FIXED + VERIFIED — migration applied once, live policy and authorization checks pass, database/RLS and isolated E2E checks pass, and the user reports successful live OWNER logo/hero upload, refresh persistence, public rendering, and replacement.\
**P3:** FIXED + VERIFIED — shell navigation lint and badge regression pass.\
**P4:** FIXED + VERIFIED — unused import removed; lint passes.

No new P0/P1 bug was discovered. No source test coverage was reduced.

Files changed specifically in the P2 continuation:

- `supabase/migrations/20261006083804_20261005094639_admin_website_appearance.sql` (filename aligned to remote version; migration SQL applied once)
- `scripts/test-catalog-database.mjs`
- `scripts/e2e-supabase-stub.mjs`
- `tests/e2e/admin-appearance.spec.ts` (new)
- `docs/qa/whole-system-bug-audit.md`
- `docs/qa/whole-system-remediation-report.md`

This final verification turn changed only the two QA reports. No application source, migration, Supabase state, or user account was changed.

P3 and P4 implementation work was completed in the preceding remediation pass and was not changed here. This workspace already contained a substantial dirty set before this turn; unrelated user work was preserved.

The dedicated E2E/build directories and scratch results were removed after verification; prior `.next*` and test-result directories were preserved. `next-env.d.ts` and `tsconfig.json` were restored byte-for-byte to their pre-build hashes after Next updated generated paths.

No files were staged, committed, or pushed.

**Final severity counts:** P0 0 · P1 0 · P2 0 · P3 0 · P4 0. No new confirmed bugs were found. Migration drift from this finding: none. Staged: NO · Committed: NO · Pushed: NO.

**Final status:** P2, P3, and P4 are fixed and verified. Live OWNER end-to-end upload and replacement are supported by the user's manual smoke test; ADMIN/STAFF live sessions were not tested, with those authorization/UI flows covered by isolated database and E2E tests. No new regressions were found. Staged: NO · Committed: NO · Pushed: NO.

WHOLE-SYSTEM REMEDIATION COMPLETE — ALL CONFIRMED FINDINGS VERIFIED
