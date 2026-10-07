# Manual UI/UX audit — Appointment Booking System

**Date:** 2026-10-07  
**Environment:** local development site at `127.0.0.1:3000` and the repository's isolated Playwright environment at `127.0.0.1:3100` with the local E2E Supabase stub.  
**Scope:** manual public-page and booking review, authenticated E2E role workspaces, responsive checks, targeted UI fixes, and the requested project verification commands.

## Evidence labels

- **VISUALLY VERIFIED** — the rendered page was opened in a browser and inspected. Notes identify whether the view was a manual in-app browser session or an inspected E2E screenshot.
- **SOURCE REVIEWED ONLY** — source and/or an automated route assertion was reviewed, but a rendered page was not inspected.
- **NOT VERIFIED** — the required state or a safe test record was unavailable, or the flow was intentionally not submitted.

The 3100 environment uses test-only accounts, a local auth/data stub, and fake email/payment adapters. It did not connect to the configured development Supabase project. No real appointment, payment, email, business setting, profile, or location data was submitted or changed. Booking flows were left before their final submit action.

## Summary

No Critical or High UI issue was found in the inspected paths. Three targeted defects were fixed:

1. **Medium — About story rendered as `[object Object]`. Fixed.** Website content can store the story as an object or array. The public page and the owner appearance editor now use one normalizer to extract its human-readable copy.
2. **Medium — authentication pages used generic branding. Fixed.** The shared auth card now reads the configured business name and logo, with a letter fallback if no logo is configured.
3. **Low — access-denied actions looked like plain text links. Fixed.** The customer-account and switch-account actions now use the shared primary and secondary button styles.

The pre-existing booking-time formatting update was also checked in the browser: available slots, the selection summary, and the review date use 12-hour AM/PM output (for example, `1:00 PM`). The E2E selectors for those labels were already updated in the working tree before this audit.

One Low issue remains: the staff navigation includes a Profile page that explicitly says profile editing is coming in a future phase. It is clear about the limitation, but the link leads to a placeholder. This audit does not implement a new staff-profile feature.

## Targeted findings and changes

| Severity | Page/component | Finding | Change and verification |
|---|---|---|---|
| Medium | `/about`, owner Appearance | Object-backed About copy was converted to `[object Object]` on the public page; the owner editor also discarded object-backed copy when pre-filling the field. | Added `src/features/public-site/about-content.ts`; both the public page and editor use it. The browser now displays “Your neighborhood barbershop”. Added four unit cases for strings, object fields, nested/array content, and unsupported values. |
| Medium | Login and other auth pages | Shared auth header showed generic “Appointment studio” branding rather than the configured business identity. | `AuthCard` now loads the public business name and logo. Reopened the customer sign-in page and verified “Demo Barber Studio” branding in the rendered header. |
| Low | `/auth/access-denied` | Recovery actions looked like unstyled inline text. | Converted the two actions to shared button styles. The isolated test session showed the primary account action and secondary sign-out action. |
| Low | Booking wizard | The earlier local change requested by the user formats 24-hour server time values for customers. | Visually checked `9:00 AM` through `4:30 PM` slots and the selected/review value `1:00 PM`. No appointment was submitted. |
| Low — open | `/staff/profile` | The navigation item opens a “Coming in a future phase” placeholder rather than profile controls. | Left unchanged because this requires a product feature, not a visual-only correction. |

## Discovered UI routes and coverage

Route patterns below come from the App Router page files and the production route listing. Dynamic routes were only verified for named samples unless the table says otherwise. API handlers are listed separately because they do not render UI pages.

| Area / role | Discovered pages | Status and evidence |
|---|---|---|
| Public site | `/`, `/services`, `/services?category=haircuts`, `/services/[slug]`, `/team`, `/team/[slug]`, `/about`, `/contact`, `/refund-policy` | **VISUALLY VERIFIED** in the local browser. Service details inspected for `cut-and-beard`, `hot-towel-beard-ritual`, and `signature-haircut`; team profiles inspected for Eli Cruz, Marco Reyes, and Noah Santos. Service category filtering was exercised. E2E also checks `/services/consultation`. |
| Public booking | `/book` and `/book?service=cut-and-beard` | **VISUALLY VERIFIED** in the local browser through service, professional, date, time, contact, and inline validation states. Time choices included AM/PM. The flow was stopped before submission. |
| Customer booking | `/account/book` | **VISUALLY VERIFIED** in the authenticated isolated customer workspace. Confirmed the “Back to account overview” button keeps booking inside the customer workspace. Selected the Home Service option and inspected the address, area, map-pin, optional landmark, and instructions fields. Did not request location permission or submit. |
| Guest booking/access | `/booking/manage`, `/booking/access` | **VISUALLY VERIFIED** for the guest access form and the missing/invalid private-link state. No access token was supplied and no form was submitted. A valid-link state is **NOT VERIFIED**. |
| Booking result/payment | `/book/confirmation`, `/payment/return` | **VISUALLY VERIFIED** for the no-ID/no-payment-session fallback only. A successful confirmation and a real payment return are **NOT VERIFIED**; no booking or payment was created. |
| Customer account | `/account`, `/account/appointments`, `/account/payments`, `/account/profile`, `/account/setup` | **VISUALLY VERIFIED** in an isolated customer session. Empty appointment/payment states and the profile form were opened. The profile form showed the test customer's saved full name. Direct `/account/setup` still uses the “Complete your profile” heading, but sign-in itself landed on `/account`; this audit did not change authentication routing. Mobile layout screenshots and E2E viewport assertions are included below. |
| Customer appointment detail | `/account/appointments/[id]` | **SOURCE REVIEWED ONLY** for this audit. Existing E2E tests exercise this route using isolated test appointments, but this browser pass did not open a detail record. No real appointment was created for visual inspection. |
| Staff workspace | `/staff`, `/staff/calendar`, `/staff/appointments`, `/staff/availability` | **VISUALLY VERIFIED** after normal sign-in with the isolated STAFF account. Dashboard, empty states, schedule, and regular-hours cards were opened at 390px; no horizontal overflow was measured. E2E additionally checks the mobile widths listed below. |
| Staff profile | `/staff/profile` (served by `/staff/[section]`) | **VISUALLY VERIFIED**. The page clearly states that staff profile editing is a future phase; this is the open Low finding above. |
| ADMIN workspace | `/admin`, `/admin/appointments`, `/admin/calendar`, `/admin/customers`, `/admin/services`, `/admin/services/new`, `/admin/services/categories`, `/admin/staff`, `/admin/staff/new`, `/admin/payments`, `/admin/reports`, `/admin/settings`, `/admin/availability`, `/admin/closures`, `/admin/appearance`, `/admin/announcements` | **VISUALLY VERIFIED** in an isolated ADMIN session. Each route loaded with its expected heading at 390px and no horizontal document overflow. Dashboard, appointments, and Appearance were visually inspected. E2E checks desktop customer-directory widths too. No forms were saved. |
| OWNER-only management | `/admin/access`, `/admin/staff/accounts`, `/admin/notifications` | **VISUALLY VERIFIED** in an isolated OWNER session; these routes loaded as Administrator access, Staff login access, and Email delivery. A separate ADMIN session was denied access to owner-only management, as expected. No access changes or invitations were made. |
| Admin/owner record detail | `/admin/appointments/[id]`, `/admin/customers/[id]`, `/admin/services/[id]`, `/admin/services/categories/[id]`, `/admin/staff/[id]` | **SOURCE REVIEWED ONLY** for visual coverage. Existing E2E tests exercise appointment-detail actions against the stub; individual record-detail screens were not opened and inspected one by one in this pass. |
| Auth pages | `/login`, `/register`, `/staff/login`, `/admin/login`, `/owner/login`, `/forgot-password`, `/auth/verify-email`, `/auth/access-denied`, `/auth/error`, `/auth/confirm` | **VISUALLY VERIFIED** without submitting account-changing forms. Login pages for all four roles were also opened for normal sign-in with isolated fixture accounts. Auth error and confirmation screens were checked in their no-session states. |
| Auth/session-dependent states | `/reset-password`, `/auth/mfa` | **VISUALLY VERIFIED** only in their no-session behavior: reset-password returned to login and MFA redirected to the role sign-in route. A real recovery session or live MFA challenge was not used. |
| Built-in error/loading UI | `/_not-found`, `src/app/error.tsx`, customer/admin/staff `loading.tsx` and `error.tsx` | **SOURCE REVIEWED ONLY** except for the transient loading skeleton seen while a management page loaded. The built-in not-found page and forced error states were not deliberately triggered. |

### Non-UI route handlers discovered

These endpoints do not render pages and were not visually inspected: `/api/availability`, `/api/booking/access`, `/api/booking/access/inspect`, `/api/cron/notifications`, `/api/payments/checkout`, `/api/payments/verify`, `/api/webhooks/paymongo`, `/auth/callback`, and `/auth/continue`. Their behavior is outside this UI/UX audit.

## Responsive review

Manual in-app browser sweeps were run on the homepage and booking wizard at **320, 375, 390, 430, 768, 1024, and 1440px**, at 900px height. Both had `documentElement.scrollWidth <= innerWidth` at every tested width. The 320px header shortens the visible business name but keeps the full accessible name on its home link. Booking fields stack cleanly on narrow screens; the booking footer and buttons remain inside the viewport.

The passing isolated E2E responsive checks also cover:

- Public home, services, and booking at 320, 375, 390, 430, 768, 1024, 1440, and 1920px; about, contact, team, a service detail, login, and registration at 320px.
- Owner management routes at 320, 375, 390, 430, and 768px; customer directory at 1024, 1280, and 1440px.
- Staff and customer workspace routes at 320, 375, 390, 430, and 768px.

This does **not** mean every dynamic record page was manually inspected at every width. Workspace route coverage and screenshot samples are identified above.

## Accessibility and interaction notes

- Accessibility-tree inspection confirmed named navigation, headings, form labels, radio/checkbox descriptions, and primary actions on representative public, customer, staff, ADMIN, and OWNER pages.
- The booking wizard moves focus to each step heading. Empty customer booking details showed associated inline name/email errors. Native date selection and keyboard movement through the calendar were exercised.
- Mobile workspace menus and route visibility have E2E assertions; color contrast was not measured with an automated contrast tool. Keyboard navigation, reduced motion, every dialog, and all focus paths were not exhaustively checked.
- The E2E stub returns 404 for the Supabase Realtime WebSocket endpoint. Tests passed, but this stub cannot verify live cross-session realtime updates. Appearance preview behavior was not edited or saved during this audit.

## Screenshot evidence

These are post-change screenshots copied from the successful isolated E2E browser run and reviewed as rendered UI. The baseline screenshots from before the fixes were not saved to the repository, so a before/after image pair is unavailable for those changes. The About copy and branded sign-in changes were also visually reopened in the in-app browser; those two manual captures were not persisted as image files.

| Screenshot | View |
|---|---|
| [Public homepage — 390px, full page](manual-ui-ux-audit-assets/public-home-390-full.png) | Mobile layout and lower-page sections |
| [Public homepage — 1440px](manual-ui-ux-audit-assets/public-home-1440.png) | Desktop navigation and hero |
| [Services — mobile](manual-ui-ux-audit-assets/public-services-390.png) | Service catalog cards |
| [Booking — mobile](manual-ui-ux-audit-assets/public-booking-390.png) | Booking wizard entry state |
| [Login — mobile](manual-ui-ux-audit-assets/public-login-390.png) | Configured business branding |
| [Customer account — mobile](manual-ui-ux-audit-assets/customer-account-390.png) | Dashboard empty state |
| [Staff appointments — mobile](manual-ui-ux-audit-assets/staff-appointments-390.png) | Assigned-work empty states |
| [OWNER dashboard — mobile](manual-ui-ux-audit-assets/owner-dashboard-390.png) | Management dashboard |
| [OWNER appointments — mobile](manual-ui-ux-audit-assets/owner-appointments-390.png) | Search, filters, and empty state |
| [OWNER staff login access — mobile](manual-ui-ux-audit-assets/owner-staff-access-390.png) | Staff-access form layout |

## Verification results

All requested checks passed on the final retry:

| Command | Result |
|---|---|
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 27 files, 142 tests |
| `npm run test:db` | PASS — 532 database checks across the local PGlite harness |
| `npm run test:e2e` | PASS — 34/34 tests; `test-results/.last-run.json` reports `passed` with no failed tests |
| `npm run build` | PASS — production build completed |

The first sandboxed attempts to start Vitest, Playwright, and the build's TypeScript worker failed with Windows `spawn EPERM`. Each was rerun with the required subprocess permission and then passed. No failures were suppressed and no test was weakened.

## Remaining verification limitations

- Successful booking confirmation, valid guest-access token, payment return, account recovery, and live MFA challenge were not submitted or created.
- Dynamic customer/admin detail pages were not all visually inspected with a safe fixture record.
- No ADMIN/STAFF real deployment sessions, live realtime WebSocket updates, geolocation permission, or production data were used. Role screenshots and checks came from the local isolated E2E environment.
- The staff Profile page remains a clearly labeled placeholder.
- No development or production data was submitted or modified. E2E side effects used the fake local stub and ended when its process stopped. No migration, deployment, commit, or push was performed.

## Git status at audit completion

Changes remain local and unstaged. Existing user changes to the booking time display/test selectors and the pre-existing `docs/security/` directory were preserved. `next-env.d.ts` remains modified to the development-generated route type references that existed before this audit; the temporary E2E production references were removed. The E2E-generated additions to `tsconfig.json` were also removed.

The final file status is recorded in the workspace at audit completion; no commit or push was made.

```text
 M next-env.d.ts
 M src/app/(admin)/admin/appearance/page.tsx
 M src/app/(auth)/auth/access-denied/page.tsx
 M src/app/(public)/about/page.tsx
 M src/components/layout/auth-card.tsx
 M src/features/public-site/booking-wizard.tsx
 M tests/e2e/home-service.spec.ts
 M tests/e2e/phase-7-booking.spec.ts
 M tests/e2e/phase-8-5-guest.spec.ts
 M tests/e2e/phase-8-lifecycle.spec.ts
?? docs/qa/manual-ui-ux-audit-assets/
?? docs/qa/manual-ui-ux-audit.md
?? docs/security/  (pre-existing user data; preserved)
?? src/features/public-site/about-content.ts
?? tests/unit/public-about-content.test.ts
```

**Audit result:** incomplete because several record-detail and success-state pages remain unverified.  
**UI/UX AUDIT INCOMPLETE — ADDITIONAL VERIFICATION REQUIRED**
