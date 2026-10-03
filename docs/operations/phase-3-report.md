# Phase 3 implementation report

## Created and modified files

- Added `supabase/migrations/20260929125716_auth_application.sql`; existing Phase 2 migrations untouched.
- Added three email templates under `supabase/templates`; updated local Auth URL, confirmation, minimum-password and TOTP settings in `supabase/config.toml`.
- Added `src/features/auth/{actions,schemas,provision-customer.server,mfa-panel,customer-profile}` and `src/features/staff/invitation-actions.ts`.
- Added `src/lib/auth/{access,access.server,site-url.server}.ts`; reused and extended `require-user.server.ts`.
- Added shared authentication forms, auth card, workspace shell/navigation and coming-soon component under `src/components`.
- Added login, register, forgot/reset password, verification/resend, callback, MFA, access-denied and auth-error routes under `src/app/(auth)`.
- Added protected admin/staff/account layouts, section pages, owner staff invitation/linking page, and customer profile/setup pages.
- Updated public homepage links, root error boundary, Proxy, environment comments, privileged-client documentation and generated DB types.
- Added `scripts/bootstrap-owner.mjs`, `scripts/test-auth-database.mjs`, Vitest configuration and authentication tests; extended the test Auth shim and package scripts.
- Added authentication setup guide; updated architecture, README and verification documentation.

## Implemented flows

Cookie-based Supabase login, ordinary customer signup, global logout, email confirmation/resend, PKCE callback, password recovery/reset, customer profile provisioning/editing, TOTP enrollment/challenge, owner-only staff invitations and controlled existing-account linking.

## Authorization

Verified Supabase user and signed token assurance are combined with live protected role/profile/staff records. Role priority is OWNER/ADMIN, active STAFF, then CUSTOMER. Admin requires MFA; staff requires an active account link. Every protected page and mutation checks authorization independently. UI role switching never grants access. Customer metadata and client-supplied actor IDs never authorize operations.

OWNER-only role grants from Phase 2 are intentionally preserved, so ADMIN cannot invite/grant staff. SQL and server actions both enforce this. Customer creation uses the authenticated UUID and verified email; no guest records are claimed by email matching.

## Bootstrap and staff setup

The one-time `npm run bootstrap:owner -- --user-id UUID --email EMAIL` command requires the server-only secret, a verified active user and no existing OWNER. It is serialized in PostgreSQL and audited. No default passwords or privileged signup routes exist.

Owner staff invitations send an Auth invite and use an atomic owner-authenticated linking RPC. The new staff profile is unpublished/not bookable. Linking failures are recoverable through the controlled owner form; Auth email delivery and database writes are separate operations. Inactive accounts are not silently reactivated.

## Protected routes

All `/admin`, `/staff`, `/account` pages, including each known section page, verify access. `/admin/staff` permits administrative viewing but restricts role-granting actions to OWNER. `/reset-password` requires an active verified session. `/auth/mfa` requires an active OWNER/ADMIN identity; `/admin` additionally requires verified `aal2`.

Future business features show empty states. No full dashboard, catalog editor, availability UI, booking UI or gateway was implemented.

## Validation and limits

Local verification is complete. The production build was successfully rechecked on September 30, 2026, including compilation, TypeScript checking, page generation and route optimization.

- `npm run build`: passed.
- `npm run lint` and `npm run typecheck`: passed in the preceding verification run.
- `npm test`: 21 tests passed across four files.
- `npm run test:db`: 83 checks passed (49 Phase 2 and 34 Phase 3).

The test and lint results above were retained from the preceding successful run; no implementation changes were made before the final build retry.

Unit/integration tests exercise customer privilege rejection, metadata forgery, missing/expired identity, failed/invalid role lookups, staff inactivity, admin MFA, owner-only grants, safe redirects and registration payloads. Database tests add customer idempotency, guest non-claiming, verified email checks, owner-bootstrap controls, staff-link atomicity, and immediate deactivation.

External Auth requests in integration tests are mocked. SQL tests use real embedded PostgreSQL with an Auth shim. Managed Supabase email/MFA/PostgREST end-to-end behavior needs a configured staging project. No remote project was changed and no emails were sent during development.

Required environment, email templates, redirect URLs, TOTP and owner setup are documented in `docs/deployment/authentication-setup.md`. Production abuse controls/CAPTCHA, monitoring, MFA recovery operations and all later business modules remain follow-up work.
