# Phase 5 — services and staff management

Implemented within the existing modular monolith and separate per-business deployment model. No remote project changes were made in this phase. Staff approval before payment, appointment state transitions, authoritative snapshots and reservation exclusion constraints are preserved.

## 1. Files created / modified

Created:

- `supabase/migrations/20260930100505_catalog_staff_management.sql`
- `supabase/migrations/20260930100849_catalog_media.sql`
- `src/features/catalog/`: `schemas.ts`, `types.ts`, `data.server.ts`, `actions.ts`, `images.server.ts`, `image-actions.ts`, `forms.tsx`, `pages.tsx`, `staff-workspace.tsx`
- `src/app/(admin)/admin/services/page.tsx`, `services/new/page.tsx`, `services/[id]/page.tsx`, `services/categories/page.tsx`
- `src/app/(admin)/admin/staff/new/page.tsx`, `staff/[id]/page.tsx`, `staff/accounts/page.tsx`
- `src/app/(staff)/staff/availability/page.tsx`, `staff/loading.tsx`
- `tests/unit/catalog-validation.test.ts`, `tests/integration/catalog-access.test.ts`, `tests/integration/catalog-render.test.ts`, `scripts/test-catalog-database.mjs`
- `docs/deployment/catalog-staff-setup.md` and this report.

Modified:

- Existing admin staff index and staff dashboard routes.
- `src/features/admin/forms.tsx`: export reusable form/field controls, select support, reusable weekly-hours action/hidden fields. Existing Phase 4 settings behavior remains covered.
- `src/features/staff/invitation-actions.ts`: accurate success text when linking an existing profile.
- `src/types/database.generated.ts`: regenerated from all migrations.
- `scripts/database-harness.mjs`: test-only Storage metadata shim.
- `package.json`, `package-lock.json`: pinned direct Sharp dependency and catalog database test command.
- `next.config.ts`: 3 MiB server-action request limit to accommodate validated 2 MiB uploads.
- README and connected-project deployment notes.

No Phase 2–4 migration was rewritten. No repository Git metadata exists, so there is no commit/diff report.

## 2. Services / categories

Searchable, paginated service list with category and active filters; create/edit, category, description, slug, price, duration, buffers, publication and archive via deactivation. Category creation/editing, active/publication flags and numeric display order. No hard-delete UI. New service buffers default from business settings.

PAY_AT_BUSINESS, DEPOSIT and FULL_PAYMENT are supported. Fixed deposits use minor units; percentage deposits use integer basis points, calculated by PostgreSQL with rounding up to the smallest currency unit. Server-side decimal conversion uses BigInt rather than floating-point money arithmetic. Existing requests retain their snapshotted payment requirement after catalog edits. Inactive categories prevent new requests and acceptance; hidden categories prevent new public requests.

## 3. Service images

Admin-only decoded, resized, metadata-stripped WebP uploads with randomized paths, pointer compare-and-set, replacement/removal and unused-file cleanup. Input limit 2 MiB / 16 megapixels. Public marketing bucket is explicitly labelled in the UI. Hosted HTTP verification remains pending.

## 4. Staff management

Searchable/paginated list, profile creation/editing, public display name/bio, private full name/contact information, active/published/bookable controls, schedule and upcoming appointment views. Profile creation grants no account privileges. Owner-only invitations and verified account linking remain in `/admin/staff/accounts`. Linking can attach an active unlinked profile with the exact slug, preserving its ID, assignments and settings; existing linked/inactive conflicts fail safely.

## 5. Staff images

Use the same validated image pipeline and bucket policies as service images, under the staff path prefix. Only marketing photos belong here.

## 6. Assignments

Checkbox service assignments on each staff editor. Existing relationship rows are activated/deactivated atomically. Service detail lists assigned staff and links to their editors. No staff-specific price/duration overrides were added because the existing schema has none. Request and acceptance both enforce current eligibility.

## 7. Regular schedules

Reusable weekly editor with off days and up to four split intervals per weekday. Server validation and an added GiST exclusion constraint reject overlaps; adjacent intervals are allowed. Atomic replacement preserves valid existing reservations and rolls back incompatible schedules. Business-hours intersection remains authoritative; staff hours cannot open the business.

## 8. Exceptions

Unavailable periods for breaks/leave and extra working hours, local business-time conversion, full-day leave through consecutive midnights, bounded reason text, listing and removal. Existing schedule protection rejects exceptions/removals that invalidate active reservations. Extra hours do not override business closure rules. Existing DST gap/ambiguity checks are reused.

## 9. Staff self-service / dashboard

`/staff/availability` shows only the authenticated member's regular hours, business hours and future exceptions. Editing remains admin-only under existing policy. `/staff` shows actual today/pending/confirmed/upcoming counts, independent first-100 appointment lists and today's regular schedule. No full-business revenue or other staff's private data is returned. Empty/error/loading states are supported. This phase does not add appointment transition controls or booking UI.

## 10. Public-safe queries

`readPublicCatalog()` calls an invoker RPC with explicit field projections. Only active/published services with eligible categories and active/published/bookable staff are included, together with eligible assignments. Staff contacts live in a private RLS-protected table and are absent from public payloads. No Auth IDs or role records are included. The future public pages should reuse this query.

## 11. Security / RLS

All mutations check the verified server principal before parsing or writes and use the authenticated client. SQL management RPCs independently require current owner/admin + MFA and run as invoker. Narrow private helpers retain explicit grants and an empty search path. Staff cannot mutate their own/another profile, assign roles, change services or replace schedules. Public-safe filtering does not substitute for RLS. Existing customer/staff appointment isolation, schedule locks, audit rules and historical foreign-key protection remain.

PENDING is nonblocking. Acceptance obtains the staff interval atomically; ACCEPTED/AWAITING_PAYMENT reserve it, verified payment confirms it, and explicit expiry releases it. The Phase 5 changes add eligibility checks without altering this lifecycle. No required payment may be created before acceptance.

## 12. Tests / validation

- ESLint and TypeScript checks pass.
- Application tests: 50 passing in 10 files, including exact money/deposit validation, duration/buffers, local exceptions, actual Sharp decode/re-encode, invalid images, authorization ordering and populated/empty page rendering.
- Database tests: 204 checks (49 Phase 2, 34 Phase 3, 64 Phase 4, 57 Phase 5). Cover unauthorized RPCs/direct writes, private contacts, own-staff dashboard identity, fixed/percentage constraints, eligibility, inactive public filtering, unchanged snapshots, overlapping hours, reservation protection, existing-profile linking, and Storage metadata policies/CAS/cleanup.
- Production Next.js build passes with all new routes.
- Generated database types rebuilt from migrations.

Limits: database tests use PostgreSQL via PGlite with Auth/Storage shims. Hosted Storage/email/Auth flows and genuine multi-session races are not yet verified. Rendering tests are not interactive browser or visual screenshot checks. Security advisors must be rerun against staging after deployment.

## 13. Supabase Storage setup still required

The connected project now has both Phase 5 migrations applied through the Supabase connector. The original five migration-history version mismatch remains and still blocks a safe CLI push. Perform the staging checklist in `docs/deployment/catalog-staff-setup.md`; Auth/owner/MFA/server-only invitation secret setup also remains pending. Do not claim production readiness from migration application alone.

## 14. Phase 6 TODOs

- Build the full availability engine from business hours, staff hours, exceptions, closures, eligibility, buffers, notice/window rules and occupied reservations.
- Build customer/guest booking UI and recheck all eligibility server-side using authoritative stored prices.
- Keep acceptance-before-payment as the default; no instant-booking implementation was added.
- Add intended staff request-review workflows without loosening RLS.
- Complete staging/native concurrent-session checks before launch; decide pagination extensions if staff routinely exceed the clearly labelled 100-row views.
- Payment provider, expiration worker, refund reconciliation, appearance editor and other deferred modules retain their existing phase boundaries.
- Add operational cleanup for orphaned marketing objects if repeated network failures make manual cleanup insufficient.
