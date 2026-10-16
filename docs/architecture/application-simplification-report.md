# Application Simplification Audit

**Date:** 2026-10-15  
**Scope:** Current workspace source, routes, navigation, shared shells, server data loaders, and primary booking, customer, staff, and business workflows. The workspace already contained many uncommitted edits and deletions before this audit; findings describe the checked-out state and do not attribute those pre-existing changes to this pass.

## Executive summary

The clearest avoidable complexity was repeated information and state: booking date and time were separate wizard steps, staff saw overlapping appointment lists on the dashboard and request page, and the admin overview repeated schedule and status summaries. I simplified those flows while keeping their underlying booking, approval, Home Service, payment, branch, and role checks intact.

The STAFF Availability route already existed in source. Its route and the mobile staff workflow were checked in the local Playwright app; no duplicate route implementation was needed. A Staff Profile link advertised as “coming soon” was removed from workspace navigation.

There is one material requirement gap in the current checkout: the identity/email architecture note says the application does not send booking, payment, staff-operation, or guest-recovery emails. The prior notification implementation and admin notification page are absent from the workspace that was audited. This pass did not remove or restore those pre-existing files. Auth verification, recovery, and invitation messages remain Supabase Auth responsibilities, but customer booking notifications cannot be considered verified or complete from this source state.

## Routes and workflows inspected

I inventoried the page routes under `src/app` and traced the navigation configurations and layouts for public, authentication, customer, admin, and staff areas. The route groups include:

- Public pages: home, about, services and service detail, team and team detail, contact, booking, booking confirmation, guest booking management, refund policy, and payment return.
- Authentication: customer login and registration, owner/admin/staff login portals, email confirmation, MFA, access denied, recovery, and reset pages.
- Customer workspace: overview, appointments and appointment detail, payments, profile, booking, and setup.
- Admin workspace: overview, appointments and detail, calendar, availability, Home Service, staff and staff details, staff login access, administrator access, customers and detail, branches, services/categories and details, settings/sections, closures, announcements, payments, and reports.
- Staff workspace: overview, requests, calendar, Home Service/trip view, and availability.
- APIs: availability, payment checkout/verification, and PayMongo webhook.

Playwright exercised representative complete journeys and responsive pages against the repository’s local production-mode app and local Supabase stub. Source inspection alone was not treated as browser verification. The complete E2E suite result is recorded below.

## Actual issues found

### Confirmed workflow and navigation issues

1. **Booking had one avoidable step.** Date selection and loading/selecting an available time were separate, even though time availability depends on the chosen date. This required an extra Continue/Back transition.
2. **Staff appointment information was duplicated.** The staff overview, appointments page, and calendar repeated upcoming/today/pending appointment lists. The duplicate lists made it unclear which screen was authoritative.
3. **The admin overview repeated summaries.** Alongside headline metrics, it showed another “today at a glance” summary and a “coming up” list in addition to the schedule and pending queue.
4. **Staff Profile navigation advertised an unavailable feature.** The profile route was not implemented for staff and its navigation item said editing would come later.
5. **Sign-in entry points were ambiguous.** Public navigation exposed a generic work sign-in entry without directly distinguishing the owner, administrator, and staff portals.
6. **Single-branch pages showed unnecessary branch chrome.** The branch context strip added no decision or control when there was only one branch.
7. **Badge behavior overstated its meaning.** Counts were server-provided pending totals, but the client also kept local “seen” IDs and described those totals as new requests. That added browser storage/subscription state and could make counts disagree with the queue.
8. **A repeated public-site data read was possible.** The public layout and child page read the same website projection during one request. Admin and staff shells similarly shared their no-argument workspace reads with child pages.

### Findings that are not defects

- `/staff/availability` already had a page module. Recreating the page would have duplicated working code.
- Home Service address/map confirmation is an intentional privacy and consent checkpoint. It remains in place.
- The booking wizard’s availability, contact, Home Service location, idempotency, and final submit state is substantial because those fields drive distinct validation and safety rules. It should not be reduced by removing validation.
- `/team` has an explicit empty state when no public staff profiles exist. This is a truthful content state rather than a broken destination.
- Branch, role, payment, and database logic is distributed across feature/data/action modules. The inspection did not establish a case for a new global repository/service layer.

### Subjective opportunities

- Some admin and staff forms are dense and the booking wizard remains a large client component. This is a maintainability concern, but the relevant workflows share validation and state. Splitting them without a clear component boundary would add indirection, so no broad component rewrite was made.
- Page terminology varies between “appointments,” “requests,” and “reservations.” The labels now distinguish staff’s pending request queue from its schedule; further copy changes should be tested with real staff rather than treated as a correctness defect.

## Changes implemented

- Combined date and available-time selection into one booking step. The wizard now has five progress steps instead of six. It still requires a date and available slot before continuing, resets the slot when the date changes, preserves contact validation, preserves Home Service destination confirmation, and repeats availability checks at submission.
- Refocused the STAFF overview on the next visit, later-today appointments, and one link/count for pending review. Removed duplicate metric, queue, and upcoming-list content from the dashboard. The STAFF Requests page now focuses on requests; the calendar remains the schedule view.
- Removed redundant “today at a glance” and “coming up” blocks from the OWNER/ADMIN overview while retaining headline metrics, Home Service status, pending requests, today’s schedule, and expandable recent activity.
- Removed the unavailable Staff Profile link and renamed the staff navigation item to “Requests.”
- Added clearly labeled Work sign-in choices for Owner, Administrator, and Staff, each pointing to the correct existing login route.
- Hid the current-branch strip when one branch is the only available context; multi-branch selection and branch-aware behavior remain.
- Replaced localStorage/session badge bookkeeping with server-fed pending counts, and corrected the accessible label to say “pending appointment requests.” Home Service counts remain distinct.
- Removed a second customer booking CTA from the upcoming appointment empty state.
- Added React request-scoped caching to the existing public-site, admin, and staff workspace data readers where layouts and their child pages request the same projection in one render. No new package or app-wide abstraction was introduced.
- Kept closure ordering behavior while moving current-time comparison out of a React render path, and removed an unused import.
- Updated affected Playwright assertions to match the combined date/time step, current request navigation, pending-count badge semantics, current settings route, and actual accessible content.

## Before/after workflow complexity

| Workflow | Before | After |
| --- | --- | --- |
| Customer appointment request | Service → Professional → Date → Time → Details → Review (6 wizard steps) | Service → Professional → Date & time → Details → Review (5 wizard steps) |
| STAFF finding a request | Pending work mixed with repeated appointment lists across overview and appointments pages | Overview gives one review shortcut; Requests owns the review queue; Calendar owns scheduled visits |
| OWNER/ADMIN daily review | Headline metrics plus a second daily summary, upcoming list, pending queue, and schedule | Headline metrics, Home Service status, pending queue, schedule, expandable activity |
| Work sign-in | Generic work entry, with portal choice not immediately apparent | Explicit Owner, Administrator, and Staff choices |
| One-branch workspace | Branch context strip visible despite no branch choice | Strip hidden; it remains for multi-branch selection or a branch-context warning |
| Request badge | Browser-managed “seen” state layered over a server pending count | Server pending count only; visiting the queue does not clear a still-pending request |

## Product capabilities and safety boundaries

The simplification changes did not modify database migrations, RLS policies, MFA rules, branch authorization, overlap protection, payment verification, guest access tokens, or Home Service coordinate-handling logic. Multi-branch selection, OWNER/ADMIN/STAFF authorization, customer and guest booking, approval modes, at-business booking, map-based Home Service destinations, staff navigation/trip screens, online checkout, and business reporting remain represented in the current route/code structure.

**Customer notification status:** full booking and payment notification delivery is not present in the audited working tree. The current identity/email document says the app sends no such messages; email/outbox and admin notifications files were already absent/deleted before this work began. Supabase Auth email flows are separate. This is a current-state gap against the requirement to preserve customer notifications and needs a deliberate follow-up decision; it is not a capability removed by these simplification edits.

## Validation performed

- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm run build` — passed; Next.js produced the production route manifest.
- `npm test` — 112 passed, 5 failed out of 117. Failures are in existing branch-management assertions/action mocks (3), Home Service availability authorization expectations (1), and a static-render integration harness that suspends while rendering an async admin view (1). The focused Home Service settings copy assertion was updated for the new settings section and passes.
- `npm run test:db` — blocked at the first database script. `scripts/test-database.mjs` expects 32 tables with RLS and finds 29, so the chained later database scripts do not run. No database reset, migration deletion, or production operation was performed.
- `npm run test:e2e` — final full run: 22 passed, 1 failed out of 23. The failing retry/idempotency test intermittently times out while resolving its submit-button locator; the captured browser state had already navigated to the booking confirmation. The same test passed in an earlier run. The affected UI assertions were updated, and targeted follow-ups passed the Home Service request, staff approval shortcut, badge counts, public work sign-in links, and narrow-screen admin navigation.
- `git diff --check` — passed; Git printed line-ending conversion warnings for the existing mixed-line-ending working tree.

The browser suite uses a local Supabase stub and local production-mode server. It does not verify live Supabase RLS behavior, real PayMongo settlement/webhooks, Auth SMTP delivery, or external map-provider reliability.

## Remaining opportunities and verification limits

1. Restore or deliberately replace customer booking/payment notification delivery, with tests for consent, retries, and privacy before calling the notification requirement complete.
2. Repair the database test harness/schema expectation (32 versus 29 RLS tables) so all database scripts can run locally.
3. Align the branch-management and Home Service authorization unit tests with current intended behavior, and make the admin static-render test use an async-capable rendering harness.
4. If future changes touch the booking wizard again, consider extracting the location editor only after defining a stable props/state boundary; do not move location validation or coordinates into broader client/global state.
5. Browser verification covered app journeys with local fixtures, not all pages against live services. External map tiles, Auth email delivery, production notifications, real payment settlement, and production RLS remain unverified here.
