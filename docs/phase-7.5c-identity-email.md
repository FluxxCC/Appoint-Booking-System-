# Phase 7.5C: identity, staff login and email foundation

## Identity model

- OWNER, ADMIN and STAFF are application access roles. CUSTOMER records and STAFF profiles are business records and do not require an Auth account.
- A staff profile can be published/bookable with `staff.auth_user_id` unset. `/admin/staff` manages professional profiles; the OWNER-only **Staff login access** page separately invites, connects or disables a staff login.
- Enabling access connects one existing email identity to the chosen active profile and grants STAFF. The database rejects duplicate account-to-profile links and OWNER/ADMIN identities. Disabling access removes STAFF and clears the staff link, but preserves the staff record and any customer record for the same person. Employees choose their own password from the Supabase Auth invitation flow.
- CUSTOMER registration remains optional; public guest booking continues to use its scoped token. Registration input does not accept application roles.
- OWNER bootstrap and administrator management continue through their existing OWNER+AAL2 database checks. No new OWNER bootstrap or transfer path was added.

## Admin MFA note

OWNER and ADMIN currently both require AAL2 to enter `/admin` and execute privileged database operations. MFA was not loosened. Making ADMIN MFA optional requires a coordinated review of application access decisions, database helper functions, RLS policies, and every privileged RPC that currently calls `private.is_admin()`. Do that as a separate authorization change before changing the policy.

## Booking approval policy

`business_settings.booking_approval_mode` supports `ADMIN_APPROVAL`, `STAFF_APPROVAL`, and `AUTO_CONFIRM`; it defaults to `ADMIN_APPROVAL`. The current record lifecycle and availability checks were not changed. Phase 8 must consume this policy when implementing booking acceptance/decline; until then the value is descriptive preparation and does not enable automatic confirmation or a new staff workflow.

## Transactional email with Resend

`src/server/email/` contains a server-only sender, validated message types and a structured result. It sends only from server code, accepts one validated recipient, uses an optional idempotency key, and does not log message bodies or provider responses. Missing configuration returns `not_configured`; network/provider failures return safe machine-readable outcomes. Delivery is not triggered yet by booking automation.

Set these server-only environment values when app transactional email is ready:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL` (an address on a domain verified with Resend)

Never prefix these values with `NEXT_PUBLIC_`. Do not put credentials in source control, templates, client components, or database rows. The current app environment has no Resend credentials configured, so the sender intentionally declines delivery.

## Supabase Auth email delivery

Supabase Auth continues to own identities, passwords, sessions, MFA and invitation/recovery flows. Resend only delivers email. To use Resend for Auth messages, configure Supabase project's **Authentication → SMTP Settings** with Resend SMTP after verifying the sending domain. Use `smtp.resend.com`, port `465` (TLS) or `587` (STARTTLS), username `resend`, and a Resend API key as the SMTP password. Keep the secret only in Supabase SMTP settings. Preserve the existing confirmation, invitation and recovery redirect templates (`/auth/confirm`, `/auth/callback`, and `/reset-password`) and test each in the development project before relying on delivery. This project’s Supabase-side SMTP configuration was not changed by the migration.

The app invitation actions continue to call Supabase Auth; configuring the app's Resend API sender alone does not configure Auth invitations. Without Auth SMTP delivery, onboarding responds with a safe error instead of asking an owner to share or store a password.

## Other environment dependencies

Production rate limiting remains backed by `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; production requests fail closed if that shared limiter is missing or unavailable. This phase did not change the rate limiter or add payment configuration.

## Migration and verification boundary

The additive Phase 7.5C migration adds the approval-mode column, OWNER-only staff login access operations, audit event names for staff login enable/disable, and OWNER-only administrator actions that accept email rather than requiring an account identifier in the UI. It does not modify Auth users, existing business data, the Phase 6 availability engine, guest tokens, booking lifecycle behavior, or the OWNER record. Apply the migration only to the intended development project and confirm local and remote migration history afterward.
