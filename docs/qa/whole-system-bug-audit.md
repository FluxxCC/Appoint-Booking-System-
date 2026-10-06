# Whole-System Bug Audit — Appointment Booking System

**Audit date:** 2026-10-06 (Asia/Manila)\
**Mode:** Investigation only. No application functionality, migration, database, provider, or deployment setting was changed. Test infrastructure and stale E2E assertions were adjusted only after reproducing their causes; no app bug was fixed.\
**Scope state:** Current working tree, not HEAD alone. Existing user changes were preserved. E2E artifacts are in `test-results-audit-20261006/`; temporary build output was removed after the successful build. No real provider credentials were used.

## Executive summary

The audit found **one confirmed functional bug** in the connected Supabase environment: uploading a logo or hero image from `/admin/appearance` is denied because the app's required `appearance_media_admin_insert` Storage policy is absent remotely. The appearance table itself and its RLS policies are present, so ordinary appearance settings may still save; image upload fails and the UI returns an upload error. The local appearance migration that defines this upload policy is missing from the remote migration history.

The quality baseline reproduces the known lint error in `shell-nav.tsx` and unused `Link` warning in the admin error page. TypeScript, unit tests, database tests, and an isolated webpack production build passed. The original E2E run's 25/30 failures were traced to a cold webpack development server, stale expectations for signed-in booking redirects and rendered labels, and incomplete production test configuration. After harness and test-only corrections, the final production-mode suite passed 31/31, including the added owner/admin customer-directory regression case. Additional route/viewport checks passed for owner/admin/staff/customer at 1024, 1280, and 1440 px, and keyboard/form-accessibility checks passed. No E2E-confirmed application behavior bug remains.

This audit is **complete for the requested static, database-harness, and local browser scope**. It retains one confirmed P2 application issue, one P3 quality-gate failure, and one P4 lint warning. The remote appearance-media policy issue is still unremediated. No application fixes were applied.

**Severity totals at audit completion:** P0 0 · P1 0 · P2 1 · P3 1 · P4 1. Test/environment findings are not assigned a product severity. See the remediation continuation at the end for the current disposition.

## 1. Source state reviewed

- Branch: `main`
- HEAD: `72e0330a670c1c1622d8c502afcd5c25eeeabc3e`
- Tracked files at audit start: 320
- Git status entries at audit start: 97 modified, deleted, or untracked entries, including pre-existing user work and the prior security report. No changes were discarded.
- Local migrations: 26
- Remote migration history: 25
- The 97-entry baseline list is preserved in the appendix below. The audit report itself was not present at audit start.

### Modified/deleted entries at audit start

```text
M next-env.d.ts
M scripts/database-harness.mjs
M scripts/e2e-supabase-stub.mjs
M scripts/generate-foundation-types.mjs
M scripts/test-database.mjs
M src/app/(admin)/admin/calendar/page.tsx
M src/app/(admin)/admin/error.tsx
M src/app/(admin)/admin/layout.tsx
M src/app/(admin)/admin/notifications/page.tsx
M src/app/(auth)/auth/continue/route.ts
M src/app/(auth)/auth/mfa/page.tsx
M src/app/(auth)/forgot-password/page.tsx
M src/app/(auth)/login/page.tsx
M src/app/(customer)/account/appointments/[id]/page.tsx
M src/app/(customer)/account/appointments/page.tsx
M src/app/(customer)/account/layout.tsx
M src/app/(customer)/account/page.tsx
M src/app/(public)/book/confirmation/page.tsx
M src/app/(public)/book/page.tsx
M src/app/(public)/booking/manage/page.tsx
M src/app/(public)/contact/page.tsx
M src/app/(public)/layout.tsx
M src/app/(public)/page.tsx
M src/app/(public)/refund-policy/page.tsx
M src/app/(public)/services/[slug]/page.tsx
M src/app/(public)/services/page.tsx
M src/app/(public)/team/[slug]/page.tsx
M src/app/(public)/team/page.tsx
M src/app/(staff)/staff/layout.tsx
M src/app/api/availability/route.ts
M src/app/globals.css
M src/components/customer/appointment-list.tsx
M src/components/layout/app-shell.tsx
M src/components/layout/auth-card.tsx
M src/components/layout/navigation.ts
M src/components/layout/shell-nav.tsx
D src/components/public-site/public-bottom-nav.tsx
M src/components/public-site/site.tsx
M src/components/ui/nav-icon.tsx
M src/features/admin/actions.ts
M src/features/admin/data.server.ts
M src/features/admin/forms.tsx
M src/features/admin/pages.tsx
M src/features/admin/schemas.ts
M src/features/admin/types.ts
M src/features/admin/ui.tsx
M src/features/appointments/customer-data.server.ts
M src/features/auth/actions.ts
M src/features/auth/customer-profile.tsx
M src/features/auth/provision-customer.server.ts
M src/features/catalog/actions.ts
M src/features/catalog/data.server.ts
M src/features/catalog/forms.tsx
M src/features/catalog/pages.tsx
M src/features/catalog/schemas.ts
M src/features/catalog/staff-workspace.tsx
M src/features/catalog/types.ts
M src/features/public-site/booking-actions.ts
M src/features/public-site/booking-wizard.tsx
M src/features/public-site/model.ts
M src/lib/auth/access.server.ts
M src/lib/time/index.ts
M src/proxy.ts
M src/server/email/outbox.server.ts
M src/server/email/templates.ts
M src/types/database.generated.ts
M tests/e2e/phase-8-5-guest.spec.ts
M tests/e2e/phase-8-lifecycle.spec.ts
M tests/e2e/ui-redesign.spec.ts
M tests/integration/admin-render.test.ts
M tests/integration/catalog-access.test.ts
```

### Untracked entries at audit start

```text
?? docs/home-service.md
?? docs/security/deep-security-audit.md
?? src/app/(admin)/admin/appearance/page.tsx
?? src/app/(admin)/admin/services/categories/[id]/page.tsx
?? src/app/(auth)/admin/login/page.tsx
?? src/app/(auth)/owner/login/page.tsx
?? src/app/(auth)/staff/login/page.tsx
?? src/app/(customer)/account/book/page.tsx
?? src/components/public-site/announcement-banner.tsx
?? src/components/public-site/public-nav.tsx
?? src/components/ui/back-button.tsx
?? src/features/admin/appearance-actions.ts
?? src/features/admin/appearance-form.tsx
?? src/features/admin/calendar.tsx
?? src/features/admin/home-service-status.ts
?? src/features/admin/review-actions.tsx
?? src/features/auth/workspace-login.tsx
?? src/features/catalog/category-order-table.tsx
?? src/lib/maps.ts
?? supabase/migrations/20261004232834_customer_directory_tabs.sql
?? supabase/migrations/20261004235309_reorder_service_categories.sql
?? supabase/migrations/20261005094639_admin_website_appearance.sql
?? supabase/migrations/20261005130536_20261005101246_home_service_booking.sql
?? supabase/migrations/20261005131827_home_service_acceptance_fee_snapshot.sql
?? tests/e2e/home-service.spec.ts
?? tests/unit/home-service-status.test.ts
```

> This is the pre-report Git status snapshot. Counts are based on status entries, not unique application modules.

## 2. Application inventory

### User-facing routes

- **Public site:** `/`, `/about`, `/contact`, `/refund-policy`, `/services`, `/services/[slug]`, `/team`, `/team/[slug]`, `/book`, `/book/confirmation`, `/booking/access`, `/booking/manage`, `/payment/return`.
- **Authentication:** `/login`, `/register`, `/forgot-password`, `/reset-password`, `/auth/verify-email`, `/auth/confirm`, `/auth/callback`, `/auth/continue`, `/auth/mfa`, `/auth/error`, `/auth/access-denied`; role entry pages `/owner/login`, `/admin/login`, `/staff/login`.
- **Customer:** `/account`, `/account/[section]`, `/account/setup`, `/account/appointments`, `/account/appointments/[id]`, `/account/book`, `/account/payments`, `/account/profile`.
- **Staff:** `/staff`, `/staff/[section]`, `/staff/appointments`, `/staff/calendar`, `/staff/availability`.
- **Owner/Admin:** `/admin`, `/admin/[section]`, appointments/detail, calendar, availability, customers/detail, staff/detail/accounts/new, services/detail/new/categories/detail, settings, closures, announcements, payments, reports, access, notifications, appearance.
- Loading/error/not-found UI exists at app and selected role-route levels.

### Server/API/database surfaces

- Seven API routes: availability; guest-access inspect/exchange; payment checkout/verify; PayMongo webhook; notification cron.
- Twelve server-action modules were inventoried by `use server` search.
- SQL migrations define the Supabase schema/RLS/storage/triggers and public/private functions; the source search found 163 function-definition statements across the migration history, including redefinitions over time (not 163 unique RPCs).
- Media uses the public `catalog-images` Storage bucket with database policies.

### Lifecycle map

- **Booking:** availability request → validated wizard input → server derives canonical service/price and calls transactional booking RPC → `PENDING` or policy-dependent automatic acquisition → approval/payment state transitions and append-only events.
- **Payment:** authorized checkout request → server-created PayMongo checkout → provider webhook signature verification → idempotent settlement or exception review; browser return polls but is not payment proof. Payment expiration is enforced in database lifecycle functions and may be triggered lazily by lifecycle/availability operations.
- **Guest access:** token issuance → hashed token record and email delivery → non-consuming link inspection → intentional exchange/consumption → scoped HttpOnly cookie → appointment access/recovery.
- **Email:** transactional event/outbox write → immediate post-commit dispatch attempt → leased delivery/retry state → `/api/cron/notifications` worker entry point.
- **Home Service:** authenticated customer/address validation → server-side area, schedule, travel-buffer and fee calculations → private destination table → constrained customer/admin/staff reads, with staff destination available according to appointment lifecycle.
- **Availability:** public API validates inputs and rate-limits; server RPC derives candidate slots from hours, exceptions, closures, buffers and current reservations.

## 3. Audit approach and checks run

- Inspected route inventory, action modules, critical request flows, database harness, tests, current local migrations, and the connected Supabase migration/policy state.
- Inspected the Playwright config and stub server. Next's installed Turbopack guidance states linked dependencies outside the detected project root require expanding `turbopack.root`; because E2E is not a bundler test, the isolated browser server now uses the existing webpack path. The real workspace's `node_modules` is a physical directory; the junction existed only in the earlier isolated copy.
- Added a test-only configurable output directory and a Playwright fixture that attaches console errors/warnings, page errors, failed requests and HTTP 404/5xx diagnostics. The original attempt did not change assertions; later evidence-based test corrections are described below.
- Ran lint, TypeScript, unit, database, complete E2E, and webpack production build commands. Vitest/E2E/build needed Windows child-process permissions; no real email or payment was sent.
- Did not run owner bootstrap or any command that changes live records.
- Did not perform manual registration, payment, email, or real account actions.

### E2E ROOT-CAUSE ANALYSIS

**RAW FAILURES:** 25\
**UNIQUE ROOT-CAUSE CLUSTERS:** 5\
**Confirmed application bugs from these failures:** 0\
**Unresolved original E2E failures:** 0

The five clusters are: (1) cold development-server compile/HMR/document-load timing, including login/navigation/availability symptoms; (2) stale signed-in booking redirect; (3) stale rendered labels, duplicate text, guest-only locator/reference, and workspace navigation expectations; (4) missing production test-only Redis/PayMongo setup; and (5) scheduler-sensitive internal dispatch counter expectation.

A separate supplemental responsive probe found a sixth, **additional test-stub gap outside the original 25 failures**: the stub lacked `admin_customer_directory`, so the admin customer route reached its error UI while the viewport test checked only its heading/overflow. The app's RPC contract and migration show the required JSON shape; the local stub now returns the empty-directory shape for OWNER/ADMIN and denies other roles. A focused owner/admin run checked the real Customers heading and no overflow at 1024/1280/1440 px and passed. This adds no application bug and is not counted in the five root-cause clusters for the original failures.

### E2E infrastructure outcome

- **Original run:** The original 30-case suite ran against `next dev --webpack`: 5 passed and 25 failed. The raw failure artifacts remain in `test-results-audit-20261006/`; the unmodified first production attempt is retained in `test-results-audit-20261006-production/`.
- **Root cause of the timeout cluster:** Cold `next dev --webpack` compilation/HMR and document-load waiting made navigation and the original 5-second login URL assertion expire. Several screenshots show the requested page rendered while the test remained blocked waiting for `load` or a wizard control. A 25-second diagnostic showed local Auth token/user/JWKS/access/profile requests all returned 200 and the customer was redirected after the cold route finished compiling. Production-mode login redirected in about 1.7 seconds. The dev-server timeout was a harness/environment issue, not a reproduced authentication defect.
- **Availability 500:** The original transient `/api/availability` 500 occurred in the same cancelled/slow development navigation. It was not reproduced against the production server: the stub RPC returned 200, and the deliberate API error case returned the expected 503. Classify the earlier 500/JSON parse error as a cancelled/incomplete dev response, not an application or provider failure.
- **Test server:** E2E now runs a webpack production build and `next start` through `scripts/e2e-production-server.mjs`, isolated in `.next-e2e-production`. Test-only Redis handling is provided by the local stub at port 54322; only the E2E bearer is accepted, counters are in memory, and reset clears them. `PAYMONGO_TEST_MODE_ENABLED` is set only in Playwright with a test-only secret. Existing `.next` and `.next-e2e` were preserved.
- **Supplemental admin-directory stub correction:** Source and `20261004232834_customer_directory_tabs.sql` confirm `admin_customer_directory` returns `{ customers, total, page, timezone }` to admins. The local stub had no handler and returned an RPC error. Added a scoped empty result for OWNER/ADMIN, then reran the customer directory at all three desktop widths for both roles; all six route/width checks passed with the expected Customers heading and no overflow.
- **Evidence-based test updates:** Three booking specs now expect the current source redirect to `/account/appointments/<id>` for signed-in bookings, while guests retain `/book/confirmation`. Guest-page-only reference locators were changed to the visible shared appointment reference. Stale assertions for duplicate “Waiting for approval” text, “payment deadline” (rendered label is “Pay by”), and public-account navigation were aligned to rendered UI. The retry test still asserts one appointment/request key and one delivered outbox job plus two receipts/emails; it no longer asserts a scheduler-sensitive internal dispatch counter.
- **Final run:** Complete suite: **31 passed, 0 failed, 0 flaky, 0 skipped** in `test-results-audit-20261006-final-verified/`. This includes the original 30 cases plus the customer-directory responsive regression test. The original and prior successful result directories were preserved. Changes were confined to test startup/configuration and outdated assertions; application source and database behavior were unchanged.

| Status | E2E cases |
|---|---|
| **PASS (31)** | The 30 original cases plus the owner/admin customer-directory responsive regression case passed in `test-results-audit-20261006-final-verified/`, including guest/registered booking, Home Service gate, identity and guest-token access, email/outbox, recovery, appointment lifecycle/payment UI, role workspaces, and responsive checks. |
| **FAIL (0)** | None in the final full run. The 25 original failures are classified individually under E2E-01 below. |
| **FLAKY (0)** | None |
| **SKIPPED (0)** | None |

## 4. Findings

### P0 — Critical

None confirmed.

### P1 — High

None confirmed.

### P2 — Medium

#### BUG-01 — Appearance logo and hero uploads are rejected by remote Storage RLS

- **Severity:** P2 — Medium
- **Classification:** CONFIRMED
- **Confidence:** High (live policy catalog verified read-only)
- **Affected roles:** OWNER, ADMIN
- **Affected page/route/function:** `/admin/appearance`; `saveAppearance`; `catalog-images` Storage insert.
- **Prerequisites:** An owner/admin with admin-area access uploads a valid JPEG, PNG, or WebP logo/hero image and saves the appearance form against the connected live project.
- **Reproduction:**
  1. Sign in as OWNER or ADMIN and open `/admin/appearance`.
  2. Choose a supported image under the UI's 2 MiB limit.
  3. Save appearance.
- **Expected:** The image is converted to WebP, uploaded under `appearance/logo/<uuid>.webp` or `appearance/hero/<uuid>.webp`, and its path is saved in `website_settings`.
- **Actual:** The application upload is governed by RLS and the connected database has zero `appearance_media_admin_insert` policies. The upload is denied, `saveAppearance` returns “Image upload failed. Check the catalog image storage configuration and try again.”, and the appearance write does not proceed.
- **Evidence:** Live read-only query found `appearance_upload_policy_count = 0`. The connected DB has `website_settings` and its admin/published policies/columns, so the confirmed mismatch is specifically the appearance-media insertion policy. Local `supabase/migrations/20261005094639_admin_website_appearance.sql` creates the missing policy. `src/features/admin/appearance-actions.ts` uploads the file to `catalog-images` before updating `website_settings` and returns an error when Storage rejects it.
- **Likely root cause:** The local migration `20261005094639_admin_website_appearance.sql` is absent from remote migration history and its Storage policy is not installed remotely. This local migration is the only local-only migration; other local migration versions appeared in remote history.
- **Affected files:** `src/features/admin/appearance-actions.ts`; `supabase/migrations/20261005094639_admin_website_appearance.sql`.
- **Recommended fix:** Apply/reconcile the reviewed Storage policy through the normal migration/release process after confirming target environment, then verify owner/admin upload and non-admin denial. No migration was applied during this audit.
- **Regression test required:** Add/retain an isolated Storage-policy test that confirms authenticated admin insert succeeds only for correctly shaped appearance paths and unauthorized roles/path patterns fail; add one admin appearance upload UI test.

### P3 — Low

#### BUG-02 — The lint command fails on synchronous state update inside an effect

**Remediation status (2026-10-06): FIXED + VERIFIED.** `ShellNav` now derives unseen badge IDs with `useSyncExternalStore` and a localStorage-backed external store; no `setState` runs in an effect. Full lint and the badge E2E regression passed.

- **Severity:** P3 — Low
- **Classification:** CONFIRMED (quality-gate failure; not a reproduced user-facing runtime defect)
- **Confidence:** High
- **Affected roles:** All workspace users indirectly; CI/developers directly.
- **Affected page/route/function:** Shared workspace navigation used by owner/admin, staff, and customer areas.
- **Prerequisites:** Run `npm run lint`.
- **Reproduction:** Execute `npm run lint` from the project root.
- **Expected:** ESLint exits zero.
- **Actual:** ESLint exits 1 with `react-hooks/set-state-in-effect` at `src/components/layout/shell-nav.tsx:82`, where `setUnseen(next)` runs synchronously inside the effect.
- **Evidence:** Full lint output reproduced this error on 2026-10-06.
- **Likely root cause:** Badge state is derived from props plus localStorage in an effect and copied synchronously into React state.
- **Affected files:** `src/components/layout/shell-nav.tsx`.
- **Recommended fix:** Derive unseen IDs without synchronously setting state in the effect, or update state from a subscription/deferred synchronization pattern accepted by the project’s React lint rules.
- **Regression test required:** Lint must pass; add a navigation-badge test for unseen IDs, click-to-clear, refresh persistence, and newly arriving IDs.

#### Prior BUG-04 — Hydration/pre-mount warning not reproduced; withdrawn from severity count

- **Classification:** UNCONFIRMED / NOT REPRODUCED; not counted as a product bug.
- **Evidence:** Inspected original retained Playwright traces and reran minimal `/book` load/navigation probes against development and production-like servers. No hydration mismatch or pre-mount warning was present. The traces contain the stub's Realtime WebSocket 404. The reported warning came from an earlier development run and cannot be attributed to `PublicLayout` or a specific component. `shell-nav.tsx` still has the independent lint finding BUG-02; no evidence links that lint finding to the warning.

### Test and environment findings (not assigned a product severity)

#### E2E-01 — Original 25 Playwright failures were test-harness/environment or stale-expectation failures

- **Severity:** Not assigned; no app bug confirmed by this E2E failure set.
- **Final classification:** All 25 initial failures were resolved by using a production-like test server, making test dependencies deterministic, or correcting expectations that disagreed with current source/UI behavior. The final 31-case run passed. No app behavior or migration was changed.
- **Failure clusters:** (1) cold webpack dev compile/document-load timeouts; (2) signed-in booking redirect asserted as guest confirmation; (3) stale locators/text/navigation expectations; (4) production test Redis/PayMongo mode configuration; (5) scheduler-sensitive dispatch counter assertion.
- **Realtime:** Every browser run logs a Realtime websocket handshake 404 because the local Supabase stub does not emulate websockets. It is expected stub output; the UI uses fallback refresh and the connection does not block booking/navigation. It is not an E2E failure or confirmed app issue.
- **Availability:** The original 500/`Unexpected end of JSON input` was not reproducible against the production-like server. The normal stub RPC response was 200 and the deliberately simulated application error returned 503 as expected. It belongs to cluster 1 below.
- **Hydration / pre-mount warning:** Original retained traces and targeted probes did not reproduce either warning. Prior BUG-04 is unconfirmed and withdrawn from severity counts.
- **Evidence:** Original test contexts/traces under `test-results-audit-20261006/`; first production attempt under `test-results-audit-20261006-production/`; final complete run under `test-results-audit-20261006-final-verified/`; earlier complete run under `test-results-audit-20261006-final/`; targeted responsive/accessibility probes.

| Original failed case | First observed failure | Root cause | Classification and retest |
|---|---|---|---|
| `registered customer can request Home Service with reviewed location and fee` | 5 s login URL assertion expired on `/login` while submit/compile remained pending. | Cold dev compilation exceeded assertion budget; Auth and role lookups eventually returned 200. | Harness timing. Home Service registered flow passes in final production suite. |
| `guest browses services and submits a pending request with private management access` | Timed out waiting for `Continue`; snapshot showed public landing page and Next compile overlay. | Cold route compilation plus `load`/navigation wait. | Harness timing. Passes final production suite. |
| `registered customer can book and see only their own appointment` | Same short login redirect assertion. | Cold dev compilation. Source inspection proved signed-in booking redirects to `/account/appointments/<id>`. | Harness timing plus stale route expectation; updated test passes. |
| `guest retries reuse the request key and do not create another appointment` | Timed out waiting for `10:00` while booking route was compiling. | Cold route compile; a later retry-counter assertion was independently scheduler-sensitive. | Harness timing plus brittle test metric; checks appointment/key uniqueness and delivered artifacts. Passes. |
| `guest and registration settings and availability empty/error states have clear responses` | Booking `goto` waited for `load`; page rendered but request was cancelled/slow. | Cold webpack route/navigation timing; associated 500 was not reproducible. | Harness timing; production RPC 200 and deliberate error 503. Passes. |
| `public pages and booking controls fit mobile, tablet, and desktop viewports` | Booking route `goto` waited for `load` until timeout. | Cold dev page compilation. | Harness timing. Responsive suites pass. |
| `guest booking stays account optional and opens a scoped pending portal` | Timed out waiting for initial `staffChoice`. | Cold booking route compilation. | Harness timing. Passes final suite. |
| `a committed guest booking is immediately emailed through the outbox and acknowledged` | Timed out before wizard reached submission. | Cold booking route compilation. | Harness timing. Passes final suite. |
| `staff operational email requires sign-in and returns to its assigned request` | Timed out during staff/admin route navigation. | Cold dev route compilation before intended assertion. | Harness timing. Passes final suite. |
| `recovery response is generic, email exchange restores access, and replay fails` | Timed out during multi-route guest access flow. | Cold navigation and cancelled in-flight RSC requests. | Harness timing. Passes final suite. |
| `guest link remains usable at 59 minutes and reports real expiration after 60 minutes` | Timed out before access flow completed. | Cold route compilation/navigation. | Harness timing. Passes final suite. |
| `invalid and older fragment links reveal no booking, while an older valid link can be exchanged` | Timed out before reaching all token cases. | Cold navigation/compilation. | Harness timing. Passes final suite. |
| `a signed-in customer can use guest token access without claiming ownership` | Customer login redirect URL assertion expired. | Cold dev login. | Harness timing. Passes final suite. |
| `customer payments has a customer-facing empty state` | Customer login redirect URL assertion expired. | Cold dev login. | Harness timing. Passes final suite. |
| `registered CTA opens directly for the owner and denies a different signed-in customer` | Customer login URL assertion expired; helper also assumed guest-only confirmation. | Cold dev login plus stale route expectation. | Harness timing and stale test expectation. Passes final suite. |
| `registered customer appointment email returns through login to the owned appointment` | Customer login URL assertion expired; signed-in booking detail route expectation was stale. | Cold dev login. | Harness timing and stale route expectation. Passes final suite. |
| `signed-in booking explains identity, locks verified email, and sign-out returns to guest` | Customer login URL assertion expired; signed-in result route differed from guest route. | Cold dev login. | Harness timing and stale route expectation. Passes final suite. |
| `assigned staff approves in staff mode` | Timed out during booking/lifecycle navigation. | Cold dev compilation prevented intended action. | Harness timing. Passes final suite. |
| `auto confirmation acquires the slot during submission` | `/booking/manage` `goto` did not settle before timeout. | Dev server/RSC navigation lifecycle. | Harness timing. Passes final suite. |
| `expired payment is visible to owner and guest without another checkout` | Timed out before owner/guest state assertions. | Cold dev role-route compilation. | Harness timing. Passes final suite. |
| `guest checkout fetch sends only the appointment ID and navigates to the validated hosted URL` | Timed out before checkout; test mode was also absent in the initial production attempt. | Cold route compilation plus missing test-only PayMongo mode config. | Harness/test config. Passes using only test secret. |
| `owner declines a pending request and guest sees declined status` | Timed out across owner/guest route transition. | Cold dev compilation/navigation. | Harness timing. Passes final suite. |
| `management views remain navigable on a narrow screen` | 90 s navigation timeout on `/admin/services`. | Full UI suite against dev server and cold route compilation. | Harness timing. Desktop role matrix and narrow-screen suite pass. |
| `public journey keeps imagery and navigation usable across viewports` | 90 s navigation timeout on `/services`. | Cold dev page load. | Harness timing. Public and role responsive checks pass. |
| `staff and customer pages stay usable on phones` | 90 s navigation timeout on `/staff`. | Cold dev role-route compilation. | Harness timing. Narrow and desktop role checks pass. |

In total, the original run had **25 failed cases**, all retested successfully after the five harness/test-only root-cause corrections. No original failure remains classified as a confirmed application defect.

#### Captured browser state and telemetry for each failure

The rows below correspond by number to the failure matrix immediately above. Original Playwright error contexts include current URL explicitly for the seven login assertion failures; for navigation/locator timeouts they preserve the in-flight target and rendered DOM, but do not serialize `page.url()` as a separate field. For those cases the current URL is therefore recorded as “last rendered page/target in trace,” rather than inferred as an exact address. `ERR_ABORTED` is an RSC request superseded by the next navigation, not a failed application API call.

| Case | Current URL captured | Expected state | Actual state | Network failure | Console error |
|---:|---|---|---|---|---|
| 1 | `/login` | Authenticated customer redirected to `/account`, then Home Service wizard. | Login page still visible at 5 s assertion; later diagnostic completed redirect. | Auth token/user/JWKS/access/profile requests returned 200 in diagnostic. | Supabase stub Realtime WebSocket 404. |
| 2 | Last rendered public page; `/book` navigation target in trace. | Booking wizard service step and `Continue`. | Landing/previous page remained rendered under compile overlay; button absent. | RSC navigation aborted on timeout; no API failure tied to assertion. | Realtime stub 404; no hydration warning reproduced. |
| 3 | `/login` | Redirect to account and owned appointment. | `/login` at 5 s URL assertion. | Auth diagnostic returned 200; no rejected auth call. | Realtime stub 404. |
| 4 | Last rendered booking route (`/book?service=consultation`). | Time choice 10:00, then submit/retry. | Wizard had not reached time step before timeout. | No failed availability response tied to this timeout; route request was slow. | Realtime stub 404. |
| 5 | Booking route under test; target `/book`. | Settings/registration responses and empty/error availability states. | `page.goto` awaited `load`; booking content rendered while navigation timed out. | One dev `/api/availability` 500/truncated response was not reproduced; production RPC 200 and intentional 503. | Realtime stub 404; no hydration mismatch. |
| 6 | Last rendered public page; booking navigation target in trace. | Public and booking controls at each viewport. | Navigation/load timed out before assertions completed. | Aborted RSC navigation; no independent HTTP failure. | Realtime stub 404. |
| 7 | Booking route under test. | Guest wizard reaches scoped pending portal. | `staffChoice` did not become available before timeout. | Slow/cancelled route request; no stable API error. | Realtime stub 404. |
| 8 | Booking route under test. | Complete guest submission and observe outbox/email. | Timed out before submission. | No outbox/provider failure reached; request flow did not get that far. | Realtime stub 404. |
| 9 | Staff/operational-request route shown by test trace. | Authentication gate and assigned request behavior. | Role-route navigation timed out before intended assertion. | RSC navigation superseded/aborted; no matching API error. | Realtime stub 404. |
| 10 | Guest access/recovery route shown by trace. | Generic response, successful exchange, replay denied. | Multi-route flow stopped at timeout before complete assertions. | No stable token API failure; navigation requests cancelled. | Realtime stub 404. |
| 11 | Guest booking-access route under test. | Link valid at 59 minutes, expired at 60. | Timeout before both time-bound states were checked. | No expiry endpoint failure captured. | Realtime stub 404. |
| 12 | Guest token route under test. | Invalid/old fragment denied; older valid link exchange succeeds. | Timed out before all token cases completed. | No stable token API failure captured. | Realtime stub 404. |
| 13 | `/login` | Authenticated user can exchange guest access without claiming ownership. | Login page still displayed at URL assertion. | Auth requests later succeeded in diagnostic. | Realtime stub 404. |
| 14 | `/login` | Customer payment empty state. | Login page still displayed at URL assertion. | Auth requests later succeeded in diagnostic. | Realtime stub 404. |
| 15 | `/login` | Owner opens owned CTA; other signed-in customer is denied. | Login page still displayed at URL assertion. | Auth requests later succeeded in diagnostic. | Realtime stub 404. |
| 16 | `/login` | Email CTA returns to the owner's appointment detail. | Login page still displayed at URL assertion. | Auth requests later succeeded in diagnostic. | Realtime stub 404. |
| 17 | `/login` | Booking contact identity/email lock and sign-out. | Login page still displayed at URL assertion. | Auth requests later succeeded in diagnostic. | Realtime stub 404. |
| 18 | Staff workspace route under test. | Assigned staff approves appointment. | Timed out before lifecycle action. | No approval API failure captured. | Realtime stub 404. |
| 19 | `/booking/manage?id=…` | Management page loads and auto-confirm has acquired slot. | `page.goto` waited for `load` until test timeout; destination DOM was present. | RSC/navigation load did not settle; no API failure tied to state transition. | Realtime stub 404. |
| 20 | Owner/guest payment route under test. | Expired payment visible without another checkout. | Timeout during role navigation before assertions. | No payment API failure captured. | Realtime stub 404. |
| 21 | Booking/checkout route under test. | Checkout POST contains appointment ID and returns validated hosted URL. | Wizard did not reach checkout before timeout. | Test mode was also absent in first production attempt; fixed in harness. | Realtime stub 404. |
| 22 | Owner appointment route under test. | Owner decline visible to guest. | Timeout during owner-to-guest route transition. | RSC navigation was cancelled; no distinct API failure. | Realtime stub 404. |
| 23 | `/admin/services` navigation target. | Narrow management route loads and remains navigable. | 90 s `goto` timeout during dev compilation. | No API failure tied to route assertion. | Realtime stub 404. |
| 24 | `/services` navigation target. | Public journey imagery and navigation load across viewports. | 90 s `goto` timeout during dev compilation. | No API failure tied to route assertion. | Realtime stub 404. |
| 25 | `/staff` navigation target. | Staff and customer phone layouts load without overflow. | 90 s `goto` timeout during dev compilation. | No API failure tied to route assertion. | Realtime stub 404. |

### P4 — Cosmetic / warning

#### BUG-03 — Unused `Link` import remains in the admin error page

**Remediation status (2026-10-06): FIXED + VERIFIED.** The unused import was removed; targeted and full lint passed.

- **Severity:** P4 — Cosmetic
- **Classification:** CONFIRMED (lint warning; no user-visible behavior observed)
- **Confidence:** High
- **Affected roles:** Owner/Admin error page only, indirectly through the warning pipeline.
- **Affected page/route/function:** Admin workspace error boundary.
- **Prerequisites:** Run `npm run lint`.
- **Reproduction:** Execute `npm run lint`.
- **Expected:** No unused-import warning.
- **Actual:** ESLint reports `Link` unused at `src/app/(admin)/admin/error.tsx:2`.
- **Evidence:** Full lint output reproduced one warning.
- **Likely root cause:** Error UI was changed to use `BackButton`, leaving the old import.
- **Affected files:** `src/app/(admin)/admin/error.tsx`.
- **Recommended fix:** Remove the unused import.
- **Regression test required:** Lint passes without warnings.

## 5. Migration and schema consistency

- Local migration count: 26.
- Remote migration count: 25.
- Only local-only migration: `20261005094639_admin_website_appearance.sql`.
- Remote-only versions: none found.
- The remote `public.website_settings` table exists with columns required by the current source and live admin/published RLS policies. Thus the table itself does not currently fail to load.
- The remote Storage policy list lacks `appearance_media_admin_insert`, and a direct read-only catalog query confirmed its count is zero. The missing policy is the INSERT policy for the existing `catalog-images` bucket and only permits authenticated admins to add paths matching `appearance/logo/<uuid>.webp` or `appearance/hero/<uuid>.webp`. This is the exact runtime mismatch behind BUG-01.
- `20261005094639_admin_website_appearance.sql` creates that policy and replaces `private.catalog_image_unreferenced(text)` so cleanup checks logo/hero references in `public.website_settings` as well as service/staff media. Both changes are directly related to appearance-media upload/removal. The migration does not drop tables or delete/rewrite existing rows; current remote `website_settings` columns are already present, so existing rows are structurally compatible. Applying this migration is the intended fix, subject to the normal environment/release review.
- The migration remains local-only and was **not applied**. No database or production data was changed during this audit.
- Customer-directory and category-reorder RPCs, and the Home Service migrations, appear in the live migration history.
- No migration was applied and no schema was modified.

## 6. Quality baseline results

| Command | Result | Details |
|---|---|---|
| `npm run lint` | **FAIL (findings reproduced)** | The current broad `eslint .` scan exceeded 1.3 GB while traversing retained/generated artifacts and was stopped. Targeted `npx eslint src tests/e2e tests/unit tests/integration` completed and reproduced the known one error (`shell-nav.tsx:82`) and one warning (`admin/error.tsx:2`); the prior full lint run also failed on these findings. |
| `npm run typecheck` | **PASS** | `tsc --noEmit` completed with exit code 0 after the E2E diagnostic fixture type exports were added. |
| `npm test` | **PASS** | 26 test files, 138 tests passed. The first sandbox attempt failed to spawn a Vite helper (`EPERM`); rerun with Windows subprocess permission passed. |
| `npm run test:db` | **PASS** | 8 PGlite/Supabase-shim groups, 515 checks total. No live database writes. |
| `npm run test:e2e` | **PASS** | Final complete run: 31 passed, 0 failed, 0 flaky, 0 skipped in `test-results-audit-20261006-final-verified/`. Original failures retained in `test-results-audit-20261006/`; `.next` and `.next-e2e` preserved. |
| `npm run build -- --webpack` | **PASS** | Next 16.3.7 webpack production build completed with placeholder integration values and an isolated `.next-build-audit-20261006` output directory. That build output was removed; `.next-e2e-production` remains as the isolated production E2E server output. Existing `.next` and `.next-e2e` were preserved. |
| Additional package scripts | **Reviewed, not run** | `dev`, `start`, `bootstrap:owner`; owner bootstrap is state-changing and out of audit scope. |

The Next build listed all expected App Router pages and API routes. This establishes a successful production compile, not successful real-provider integration or production deployment behavior. Next temporarily rewrote generated type paths during the custom-dir build; those generated `next-env.d.ts`/`tsconfig.json` changes were restored to the workspace's pre-build `.next-e2e` state.

## 7. Flow coverage

### Exercised by passing automated tests

- Unit/integration fixtures: auth access/guards, registration logic, catalog validation/render/access, guest recovery action, payment checkout/status logic, PayMongo signature logic, email templates/recipients/lifecycle/outbox/cron behavior, notification worker handling, appointment state helpers, and Home Service status derivation.
- Database harness: migration application to ephemeral PGlite; role/RLS/access controls; booking and appointment lifecycle; pricing/payment snapshots; availability and conflicts; catalog/storage policy rules; guest access/recovery; notification outbox; expiration and late-payment behavior. Total: 515 checks.
- Production compilation and route discovery: all pages/API routes listed in the build output.
- Browser: the complete 31-case production-mode E2E suite passed, covering guest Home Service gating, booking date-change resets, keyboard activation/focus movement, guest outbox dispatch, guest payment-state view, identity/access, lifecycle, role workspaces, and owner/admin customer directory. Separate responsive and accessibility probes also passed.

### E2E cases that failed in the original run

- Every original failed case is represented in the E2E-01 matrix, with its first blocking assertion and root cause.
- The final production-mode run completed all guest and registered booking, Home Service, guest-access/recovery, lifecycle, email/outbox, payment UI, owner/admin/staff/customer workspace, and responsive cases: 31/31 passed.
- Signed-in booking now correctly follows the implemented `/account/appointments/<id>` flow; guest booking continues to use `/book/confirmation`. These were stale test assumptions, not application defects.

### Browser console and network observations

- Repeated `ws://127.0.0.1:54322/realtime/v1/websocket` handshake 404 errors came from `src/components/layout/realtime-refresh.tsx` opening a Supabase channel in `useEffect`; the local stub intentionally does not emulate WebSockets. Realtime is not awaited by page rendering or booking actions; on channel error the component marks reconnecting and uses a 30-second fallback refresh interval. This is an expected test-stub limitation and harmless console noise for the tested flows.
- Hydration mismatch and pre-mount warnings were not present in retained traces or targeted production/dev probes; prior BUG-04 is withdrawn as unconfirmed.
- The single development-server `/api/availability` 500 followed by a truncated JSON parse and “destination stream closed early” was not reproduced in production mode; the request was tied to cancelled/slow development navigation. The normal API path returned 200 and deliberate API error simulation returned 503.
- Next emitted CSS preload and smooth-scroll advisories. These are warnings, not failed user-visible assertions.
- The test fixture records request failures, but route-change `ERR_ABORTED` events are expected when navigation supersedes an in-flight RSC request; no standalone API request failure was conclusively tied to a user-visible bug.

### Responsive and accessibility coverage

- Public viewport suite covers 320, 375, 390, 430, 768, 1024, 1440, and 1920 px. Owner/admin, staff, and customer route matrices were supplemented at 1024, 1280, and 1440 px; all tested routes rendered and had no horizontal overflow. Existing narrow role coverage exercises 320, 375, 390, 430, and 768 px.
- Keyboard checks passed for opening/closing the public mobile drawer and opening/closing the owner workspace menu. Booking wizard keyboard activation/focus handoff passed. Full name and email errors were present and each field's `aria-describedby` referenced its error element.
- No `<dialog>`, `role="dialog"`, or `aria-modal` component was found in the application routes reviewed; dialog-specific focus trapping/restoration does not currently apply. Native workspace disclosure and the public navigation drawer are the menu patterns present.

### Other not-exercised live behavior

- Public-site image behavior and browser-only flows against the real connected Supabase project.
- Registration and confirmation against the actual connected Auth provider; login/role/MFA flows with live accounts; browser back/refresh session behavior.
- Guest/registered booking wizard edge cases and Home Service geolocation/manual-input cases in a production browser.
- Owner/Admin/Staff UI workflows, including the appearance upload reproduction (confirmed through live policy/source evidence, not a browser click), calendar and payments pages.
- Concurrent acceptance and real-time multi-session UI behavior; database constraints are covered by isolated DB tests but browser concurrency was not run.
- Live PayMongo/Resend/Upstash behavior, actual cron schedule, provider retries, and real email delivery.
- E2E used only the local Supabase/Resend stub and test secrets. No actual accounts, email provider, payment provider, or live records were used.

## 8. Error handling, media, and operational observations

- Server actions generally return field/action errors rather than exposing provider exceptions; payment webhook responses use generic messages and no-store headers.
- Home Service geolocation has explicit denied/unavailable/timeout messages and manual-coordinate fallback in source. These were not browser-tested.
- The live media bucket is public-read and restricted to WebP with a 2 MiB object limit. Existing catalog uploads use an admin/path policy; the separate appearance path policy is the missing piece.
- Email delivery attempts immediately after commit. The app also exposes `/api/cron/notifications`, authorized by `CRON_SECRET`. No tracked `vercel.json` schedule was found. Whether a schedule exists in the hosting dashboard was not inspected; without an external schedule, retryable queued emails depend on later application dispatch attempts and may remain undelivered. This is an operational verification item, not a confirmed bug.
- Prior security review reported a separate Supabase Auth leaked-password protection configuration issue; it is not counted as a functional bug in this QA severity tally.

## 9. Prioritized remediation order

1. **P2:** Reconcile/deploy the appearance upload Storage policy and test owner/admin success plus unauthorized failure.
2. **P3:** Resolve the shared navigation lint error so the repository quality gate passes.
3. **P4:** Remove the unused admin error-page import.
4. Confirm the deployed notification cron schedule and retry behavior through hosting configuration.

## 10. Files changed by this continuation

- `next.config.ts`, `playwright.config.ts`, and `tests/e2e/fixtures.ts`: configure the isolated output/server and capture browser diagnostics.
- `scripts/e2e-production-server.mjs`: added the isolated webpack build + `next start` test server.
- `scripts/e2e-supabase-stub.mjs` and `playwright.config.ts`: added scoped in-memory Redis test behavior and reset support; the stub accepts only the test bearer and PayMongo test mode uses a test-only secret.
- `tests/e2e/home-service.spec.ts`, `phase-7-booking.spec.ts`, `phase-8-5-guest.spec.ts`, `phase-8-lifecycle.spec.ts`, and `ui-redesign.spec.ts`: diagnostic-fixture integration; the booking specs also correct signed-in appointment routing and stale UI locators/assertions. Retry checks validate durable side effects rather than a scheduler-sensitive internal counter.
- `docs/qa/whole-system-bug-audit.md`: updated E2E root-cause analysis, 25-case failure matrix, severity tally, quality results, browser observations, and responsive/accessibility results.
- `tests/e2e/admin-customer-responsive.spec.ts`: regression check for the owner/admin customer directory at desktop widths.
- `test-results-audit-20261006-final-verified/`: final 31/31 successful suite artifacts retained. Original `test-results-audit-20261006/` artifacts remain untouched. Temporary keyboard/accessibility probe was removed after passing.

No application behavior, migration, database state, package script, or deployment setting was changed. No files were staged or committed. The Next-generated `next-env.d.ts` and `tsconfig.json` were restored to their pre-build contents and verified by SHA-256 hash.

## 11. Audit limitations and verdict

This audit used current source, prior read-only live Supabase catalog inspection, automated checks, and a complete local-stubbed production-mode browser-suite run. No real user sessions, payments, emails, live records, migrations, or deployment settings were changed. Browser evidence, responsive checks, and keyboard/form accessibility checks are complete for the requested local scope. Hosting-dashboard cron state and live provider workflows were not inspected.

**Verdict:** One confirmed P2 application bug, one P3 lint failure, and one P4 lint warning. No P0 or P1 issue was confirmed. The original 25 E2E failures were harness/test expectation issues and all now pass; hydration and availability concerns were not reproduced. The remote appearance upload policy remains unremediated.

WHOLE-SYSTEM BUG AUDIT COMPLETE — READY FOR REMEDIATION

## 12. Controlled remediation continuation — 2026-10-06

This addendum records work after the audit baseline above. It supersedes the baseline's P3/P4 status and test totals while preserving the original findings and evidence.

### Starting findings and final disposition

- Starting findings: P0 0, P1 0, P2 1, P3 1, P4 1.
- P2 / BUG-01: **NOT FIXED**. The appearance Storage policy is still absent remotely; migration `20261005094639_admin_website_appearance.sql` was not applied.
- P3 / BUG-02: **FIXED + VERIFIED**. The synchronous state update in an effect was replaced with external-store-derived unseen badge state.
- P4 / BUG-03: **FIXED + VERIFIED**. The unused `Link` import was removed.
- Current confirmed severity totals: P0 0, P1 0, P2 1, P3 0, P4 0.

### P2 project and live Storage verification

- Supabase metadata identifies project `Appointment Booking System`, ID/ref `obpyyjewnsygkxobyunw`, region `ap-southeast-1`, status `ACTIVE_HEALTHY`. Its 25-migration history matches the audited app and does not contain migration version `20261005094639`.
- The project metadata does not identify an environment, and its development-branch list is empty. This does not positively establish that the connected project is the intended development/test project, as required by the controlled-remediation instructions. Therefore no migration or Storage object upload was performed.
- Fresh read-only catalog results: `storage.objects` RLS is enabled; `catalog-images` is public-read, limited to `image/webp` and 2 MiB; the existing INSERT policy is admin-gated and restricts writes to service/staff catalog paths; `appearance_media_admin_insert` remains absent. No broad catalog upload access was added.
- The migration was reviewed in full. It contains only the intended policy creation and a replacement of `private.catalog_image_unreferenced(text)` that adds website logo/hero references to its existing cleanup checks. It contains no `DROP`, `TRUNCATE`, or data rewrite; it preserves the existing MFA-backed `private.is_admin()` guard, WebP bucket constraints, and the existing no-UPDATE policy. This source review does not substitute for a live appearance upload test.
- Upload verification: **not run**. Owner/admin allow, customer/staff/anonymous deny, invalid-path denial, and disposable-object cleanup were not exercised because the environment could not be verified as development/test. No existing media was touched.
- Migration drift remaining: **YES** — the local appearance migration remains absent from the remote migration history.

### P3/P4 changes and regression coverage

- `src/components/layout/shell-nav.tsx`: unseen IDs are derived from current badge props and an external localStorage/session store via `useSyncExternalStore`. Clicks persist acknowledged request IDs, update same-tab subscribers immediately, preserve role-specific storage keys, and allow later request IDs to appear unread. The component no longer synchronously sets state in an effect.
- `src/app/(admin)/admin/error.tsx`: removed the genuinely unused `Link` import; no other error-page redesign was made in this remediation.
- `eslint.config.mjs`: globally ignores `.next*/**` and `test-results*/**` generated outputs while keeping application source and tests in lint scope.
- `tests/e2e/phase-7-booking.spec.ts`: added a focused regression for owner/admin/staff/customer badge visibility, click-to-clear, refresh persistence, new request IDs, and role-scoped seen state.
- Targeted ESLint on `shell-nav.tsx`, the admin error page, and the badge E2E spec: PASS. Full `npm run lint`: PASS with no output findings.
- No hydration warning or uncaught page error was reported by the final run. Expected local-stub diagnostics remain: Supabase Realtime WebSocket 404, aborted in-flight RSC requests, and a deliberate availability 503 case.
- New P0/P1 bugs discovered: **NO**.

### Final regression results

| Check | Result |
|---|---|
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | 138 passed, 0 failed |
| `npm run test:db` | 515 checks passed, 0 failed |
| `npm run test:e2e` | 32 passed, 0 failed, 0 flaky, 0 skipped |
| `npm run build -- --webpack` | PASS; isolated output directory |

The E2E suite covered guest and registered booking, Home Service gating, lifecycle/payment flows, role workspaces, mobile/desktop navigation, and the new badge regression. A separate focused badge run also passed. E2E used the local stub; no live accounts, emails, payments, or Storage objects were used.

### Changed files, worktree safety, and limitations

Files changed specifically by this remediation:

- `eslint.config.mjs`
- `src/components/layout/shell-nav.tsx`
- `src/app/(admin)/admin/error.tsx`
- `tests/e2e/phase-7-booking.spec.ts`
- `docs/qa/whole-system-bug-audit.md`
- `docs/qa/whole-system-remediation-report.md` (created)

These files were already dirty before this remediation except `eslint.config.mjs` and the new remediation report. The branch remains `main`, HEAD remains `72e0330a670c1c1622d8c502afcd5c25eeeabc3e`, and the broader pre-existing dirty set listed in section 1 was preserved. `next-env.d.ts` and `tsconfig.json` were restored byte-for-byte after build tools rewrote generated paths; their pre-remediation SHA-256 values were restored. No files were staged, committed, or pushed.

Generated verification artifacts are retained under `test-results-remediation-verified-20261006/`. Intermediate isolated build outputs and failed-run scratch artifacts created by this remediation were removed after verification; normal `.next`, `.next-e2e`, and user-retained audit directories were left untouched.

**Final verdict:** P3 and P4 are fixed and verified. P2 remains open because the exact project is identifiable, but the required development/test environment cannot be positively established from available metadata. Remote migration, policy creation, and functional upload verification remain blocked by that stop condition.

WHOLE-SYSTEM REMEDIATION INCOMPLETE — REVIEW REMAINING FINDINGS

## 13. Final P2 controlled-remediation continuation — 2026-10-06

This addendum supersedes the earlier P2-not-fixed and incomplete conclusions above. The user explicitly confirmed `Appointment Booking System` / `obpyyjewnsygkxobyunw` as the development/test project and authorized this migration and its verification.

- **P2 / BUG-01: MITIGATION APPLIED; NOT CLOSED.** Applied only the appearance migration once. Remote version `20261006083804` is recorded as `20261005094639_admin_website_appearance`; the local migration is now `supabase/migrations/20261006083804_20261005094639_admin_website_appearance.sql` so version/name align. Live RLS behavior is verified, but the required byte-level upload and replacement through the live Storage HTTP API were not verified; under the remediation acceptance criteria, P2 remains open.
- Live Storage readback confirms `appearance_media_admin_insert` exists exactly once for `INSERT` on `catalog-images`, restricted to authenticated active OWNER/ADMIN users with `aal2` and appearance logo/hero path names. Bucket read behavior, WebP-only MIME type, 2 MiB size cap, existing catalog policy, and `storage.objects` RLS remain intact.
- The cleanup function now checks `website_settings.logo_path` and `hero_image_path` along with service/staff paths. A rollback-only live check confirmed referenced paths are protected and replaced/unreferenced paths are eligible for cleanup. Supabase Storage's direct-delete guard remained in force. Actual Storage API object replacement/deletion was exercised only by isolated app E2E, not against live Storage.
- Before/after live business counts are unchanged: services 3, staff 3, customers 20, appointments 2, website settings 1. The live appearance object count is zero; no existing brand image, user role, or business row was changed.
- Live OWNER RLS checks accepted logo and hero metadata inserts inside a transaction that was rolled back. Anonymous and a non-admin customer were denied, and invalid appearance/other-folder paths were denied. The project has no ADMIN or STAFF role accounts, so those role checks used the existing isolated database and E2E fixtures instead of changing real roles.
- Appearance E2E covers OWNER and ADMIN logo/hero uploads, previews, save/publish, refresh persistence, public rendering, replacement cleanup, and upload failure recovery: **2 passed**. The E2E app uses the isolated local Supabase stub for byte transfer; no live Storage object was created. The connected live project has no ADMIN or STAFF account, and the browser did not have an OWNER session, so live byte upload/replace could not be completed without those session prerequisites.
- Regression suite: lint PASS; typecheck PASS; unit 138/138; database 532 checks; full E2E 34 passed, 0 failed, 0 flaky, 0 skipped; `npm run build` PASS with isolated build output.
- P3 / BUG-02 and P4 / BUG-03 remain FIXED + VERIFIED. No new confirmed P0/P1 findings were discovered. Final audit-scope totals: P0 0 · P1 0 · P2 1 (open pending live functional verification) · P3 0 · P4 0. Migration drift from this finding: none.

Files changed specifically in this continuation: the appearance migration filename, `scripts/test-catalog-database.mjs`, `scripts/e2e-supabase-stub.mjs`, new `tests/e2e/admin-appearance.spec.ts`, and these two QA reports. No files were staged, committed, or pushed. The broader pre-existing dirty worktree was preserved.

**Final verdict:** P3 and P4 are fixed and verified. The P2 migration and RLS mitigation are applied and live policy decisions passed, but P2 remains open because byte-level upload and replacement through the live Storage HTTP API were not verified. Isolated database fixtures and app E2E pass the corresponding workflows. The live project has no ADMIN or STAFF login; the local app request redirected to its admin-login page, and the connected browser could not reach the local server.

WHOLE-SYSTEM REMEDIATION INCOMPLETE — REVIEW REMAINING FINDINGS

## 14. Final P2 closeout — manual OWNER live verification — 2026-10-06

This final addendum supersedes the prior P2-open conclusions in sections 12 and 13. The user supplied results from a manual smoke test using an authenticated OWNER + MFA session against the real DEV/TEST deployment. The agent did not repeat uploads or request credentials, MFA codes, cookies, tokens, or session data.

### Evidence classification

- **LIVE VERIFIED:** target `Appointment Booking System` / `obpyyjewnsygkxobyunw`; the appearance migration is applied once and remote history is aligned; `appearance_media_admin_insert` is present; Storage RLS is enabled; live anonymous and CUSTOMER upload denials, path restrictions, and cleanup-predicate behavior were verified in the earlier controlled checks.
- **DATABASE/RLS VERIFIED:** live OWNER RLS metadata checks passed inside rolled-back transactions; isolated database authorization tests allow OWNER/ADMIN and deny anonymous, CUSTOMER, and STAFF; appearance path restrictions and cleanup/reference protection pass. Database suite: 532 checks passed.
- **ISOLATED E2E VERIFIED:** OWNER and ADMIN logo/hero flows cover upload, preview, save, refresh persistence, public rendering, replacement/cleanup, and upload-error recovery against the isolated Supabase stub. Focused appearance tests: 2 passed; complete E2E suite: 34 passed, 0 failed, 0 flaky, 0 skipped.
- **MANUAL OWNER VERIFIED (user-reported):** OWNER login + MFA passed on the live deployment. Logo and hero uploads succeeded through the real application, persisted after refresh, and rendered on the public site. Logo and hero replacements also succeeded and persisted after refresh.

ADMIN and STAFF live-session verification was not performed. The project has no such login accounts, and none were created solely for testing. Their relevant flows/denials remain covered by isolated E2E and authorization tests; this is not represented as live-session evidence.

### Final disposition

- **P2 / BUG-01: FIXED + VERIFIED.** The live policy and RLS evidence, isolated role/path/cleanup tests, and user-reported manual live OWNER upload/replacement test jointly satisfy the P2 acceptance criteria.
- P3 / BUG-02 and P4 / BUG-03 remain FIXED + VERIFIED.
- Final audit severity totals: **P0 0 · P1 0 · P2 0 · P3 0 · P4 0**.
- Regression results remain lint PASS, typecheck PASS, unit 138/138, database 532 checks, E2E 34/34 with zero failures/flakes/skips, and build PASS. No new regressions or migration drift were reported.
- This final verification turn changed only `docs/qa/whole-system-bug-audit.md` and `docs/qa/whole-system-remediation-report.md`. No application code, migration, Supabase data/configuration, or user accounts were changed. Nothing was staged, committed, or pushed.

WHOLE-SYSTEM REMEDIATION COMPLETE — ALL CONFIRMED FINDINGS VERIFIED
