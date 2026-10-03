# Phase 3 authentication setup

## Apply the additive migration

Phase 2 migrations remain unchanged. Apply `20260929125716_auth_application.sql` after them. It adds session-owned customer provisioning, a live access-context helper, owner-authorized staff linking, and one-time service-only owner bootstrap. It does not alter appointment states or slot constraints.

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --linked --dry-run
npx supabase db push --linked
npx supabase db advisors --linked --type all
```

For a local Docker stack use `npx supabase start` and `npx supabase db push --local`. No hosted project has been connected or modified by this implementation.

## Environment

Copy `.env.example` to `.env.local` and configure:

- `NEXT_PUBLIC_SUPABASE_URL`: the business's project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: its publishable key.
- `NEXT_PUBLIC_SITE_URL`: exactly `http://localhost:3000` locally or the business's HTTPS origin in deployment. Email redirects are built from this trusted value, never request Host headers.
- `SUPABASE_SECRET_KEY`: server-only secret API key for staff invitations and the controlled bootstrap command. Customer registration/login/profile/reset and ordinary role checks use the caller's authenticated client, not this key.

Vercel preview deployments need a separate test Supabase project and their own correct site URL. Do not commit `.env.local` or any real credentials.

## Supabase Auth settings

1. Enable email/password signup and email verification. Use a minimum password length of 12; enable additional provider password protections as appropriate. The application accepts 12–128 characters for new passwords and displays provider rejection safely.
2. Enable TOTP enrollment and verification. Owner/admin database policies require `aal2`; the app intentionally does not bypass this during development.
3. Set **Site URL** to the same trusted origin as `NEXT_PUBLIC_SITE_URL`.
4. Add exact redirect URLs for that origin:
   - `/auth/callback`
   - `/auth/callback?next=/reset-password`
   - `/auth/confirm`
5. Configure production SMTP and sender identity. Supabase Auth rate limits apply to signup, login, recovery, resend and MFA; tune them before launch. Test delivery to real recipients in staging. Add provider CAPTCHA/edge abuse controls before exposing public signup to production traffic.
6. Copy the supplied HTML into the matching hosted Auth email templates:
   - `supabase/templates/confirmation.html` → Confirm signup
   - `supabase/templates/recovery.html` → Reset password
   - `supabase/templates/invite.html` → Invite user

The templates use `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=...`. This supports invitations and cross-browser email use without relying on URL-fragment sessions. A confirmation page requires a deliberate POST before consuming the token, avoiding email-scanner GET consumption. `/auth/callback` additionally supports standard PKCE authorization-code exchange. Do not use the default fragment-based invitation template with this server-rendered app.

Local config.toml enables verification, TOTP and these templates, and aligns localhost URLs. SQL migrations do not apply hosted Auth dashboard settings; configure them separately. Keep the `private` schema out of exposed API schemas.

## Create the first OWNER safely

1. Apply all migrations and configure Auth as above.
2. Start `npm run dev`, open `/register`, and register yourself with your real owner email. This creates only an ordinary customer identity. Verify the email and sign in.
3. In the trusted Supabase dashboard, find that verified Auth user's UUID. Confirm that the email and UUID are yours.
4. From a trusted local terminal with the server-only secret in `.env.local`, run:

```powershell
npm run bootstrap:owner -- --user-id YOUR_VERIFIED_AUTH_UUID --email YOUR_VERIFIED_EMAIL
```

The command does not create a password, print credentials, or change existing users. The database checks the UUID/email match, email confirmation, active profile and absence of an existing OWNER under a transaction lock. It refuses repeat bootstrapping and is not executable by public/authenticated clients. The role change is audited.

5. Sign in again or open `/admin`. You will be sent to `/auth/mfa`. Set up a TOTP authenticator, scan the QR code (or enter the displayed key), and verify a current six-digit code.
6. After verification, `/admin` becomes available. Use a controlled recovery procedure if the authenticator is lost; never weaken MFA policies or create a public bootstrap endpoint.

If an OWNER already exists, this script intentionally refuses to add another. Further OWNER/ADMIN changes remain controlled owner operations; a general role-management interface is not included in Phase 3. Do not run bootstrap against unrelated projects.

## Staff invitations and account linking

The safer Phase 2 rule is preserved: **only OWNER with MFA can grant roles**. ADMIN can access the business shell and staff page, but cannot send invitations or activate staff. This is an intentional restriction, not a missing client-side button workaround: actions and SQL both enforce it.

At `/admin/staff`, the owner supplies full name, email and a unique staff URL name. The server checks the current user/roles/MFA, then invokes Supabase's server-only Auth invitation API. A user-authenticated RPC rechecks owner authorization and atomically links the returned Auth UUID, creates the staff row and grants STAFF. No role comes from invitation metadata. New staff are active but unpublished and not bookable until scheduling/catalog setup is done.

The recipient confirms the invitation, sets a password, then signs in to `/staff`. A valid STAFF role also needs an active linked staff record and an active profile. Deactivating either removes protected staff access on the next request.

Auth invitation delivery and database linking cannot be one transaction. If email delivery succeeds but linking fails, no new staff access is granted by the failed SQL transaction. The owner sees the invited account UUID and can use the separate linking form after verifying it in Supabase. The same form supports a known existing customer account. It is idempotent for an already linked active staff record with the same slug, does not reactivate disabled staff, and rejects OWNER/ADMIN target accounts. An entered UUID identifies the target, never the authorizing actor. No automatic destructive account cleanup is performed.

## Customer registration and recovery

Phase 4 adds an administrator-controlled registration toggle. The signup action checks it, and a private deferred Auth-user insert trigger prevents bypass through direct signup. Existing accounts remain usable; trusted Auth invitations are allowed by inspecting the final stored invitation timestamp. See `admin-configuration.md` for the managed-Auth verification required before deployment.

Public registration has no role selector. Server validation allowlists name, email, password and optional mobile number. Extra role/user-ID fields never enter the signup request. The existing Auth trigger creates the profile without reading role metadata.

When signup returns a session, a transaction creates/updates the customer's own record from the verified Auth UUID/email. When verification is required, no customer access is granted until verification; the confirmation handler then provisions ordinary customer details. Name/mobile metadata are treated only as validated display input. Existing guest bookings are never claimed merely because an email matches. If initial provisioning cannot finish or an older account lacks details, `/account/setup` provides a retryable profile form.

Duplicate-email responses avoid revealing account existence. Sign-in reports unconfirmed email safely, and `/auth/verify-email` can resend confirmation. Recovery emails return a generic response; reset requires a verified authenticated session. Invites and recovery use the same password-setting screen. Successful password changes sign out globally before requiring a fresh login. Existing short-lived access tokens may remain valid until expiration; live role/profile checks still apply on each protected operation.

## Access rules

Default destination priority: OWNER/ADMIN → `/admin` (through MFA); active STAFF → `/staff`; ordinary customer → `/account`. Legitimate multi-role users receive workspace-switch links. All active accounts may use customer-level functionality, provisioning their own customer profile if necessary.

Each protected page and mutation checks the server session and live database context. Layouts are an additional convenience boundary, not the only authorization check. Missing/expired/unverified sessions go to `/login`; invalid or disabled access goes to `/auth/access-denied`; missing admin assurance goes to `/auth/mfa`. Backend lookup failures fail closed. Proxy only refreshes cookies and applies private/no-store headers. Redirect destinations are explicitly allowlisted.

## Verification still required with a real project

Run hosted email signup/duplicate/resend, cross-browser verification, recovery, staff invitation and TOTP enrollment/challenge end to end. Test token expiration/reuse, secure-password-change/re-authentication settings, deployment redirect URLs, SMTP throttling and revoked accounts. Run managed Supabase advisors and API-level RLS checks. No actual email, secret-backed invitation, owner promotion or hosted MFA session was performed during this implementation.
