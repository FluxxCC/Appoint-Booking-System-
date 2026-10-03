# Per-business setup

Phase 3 adds a fourth migration and usable auth screens. Follow [Authentication setup](authentication-setup.md) after these database steps for exact hosted Auth settings, email templates, MFA, safe first-owner CLI and staff invitations. That guide supersedes the Phase 2 "when implemented" notes below.

## Application configuration

Copy `.env.example` to `.env.local` and configure:

| Variable | Purpose |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | This business's Supabase project URL |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Browser-safe publishable API key |
| NEXT_PUBLIC_SITE_URL | Local origin now; business HTTPS domain for production |
| SUPABASE_SECRET_KEY | Server-only secret API key, only when trusted jobs/backend integrations are enabled |
| SUPABASE_PROJECT_ID | Project reference for your CLI workflow; not read by the app |
| SUPABASE_ACCESS_TOKEN / SUPABASE_DB_PASSWORD | Optional CLI environment credentials; prefer interactive login/link |

Do not commit actual credentials. Vercel preview deployments must use a separate test project and test integrations. Business timezone, currency, branding and policy versions are database records, not build-time environment variables. Builds do not need credentials because the only current page is static. Auth/data operations fail closed if configuration is missing.

## Commands

Run from the project root. Dependencies and the Supabase CLI are pinned in package-lock.json.

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
```

For a new, empty staging Supabase project:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --linked --dry-run
npx supabase db push --linked
npx supabase migration list --linked
npx supabase db advisors --linked --type all
npx supabase gen types --linked --schema public --lang typescript | Set-Content -Encoding utf8 src/types/database.generated.ts
```

Review the target project and dry-run before applying. No remote project was linked or changed during Phase 2. Do not run these initial migrations on an unrelated existing database. Managed project settings such as API exposure and redirect URLs are not automatically changed by SQL migrations; inspect them in the dashboard. Keep `private` out of exposed schemas.

For a local stack, install/start Docker Desktop first:

```powershell
npx supabase start
npx supabase db push --local
npx supabase migration list --local
npx supabase db advisors --local --type all
npx supabase gen types --local --schema public --lang typescript | Set-Content -Encoding utf8 src/types/database.generated.ts
```

The CLI-created migrations were executed and tested using PGlite because Docker/psql are unavailable in this environment. This validates real PostgreSQL SQL/constraints/RLS, with a test-only auth shim. It does not verify PostgREST, GoTrue, Storage, managed extension availability or simultaneous native database sessions. Run those checks against staging before production.

Offline type regeneration (already run):

```powershell
node scripts/generate-foundation-types.mjs
```

Offline types are derived from migrated database columns/enums/RPCs, not handwritten placeholders. Relationship metadata is intentionally empty; replace with official CLI generation before building relational queries.

## Owner bootstrap and business provisioning

1. Create/invite the real owner's Auth user through the Supabase dashboard. The database trigger creates an ordinary profile, with no privileged role.
2. Enroll the owner in MFA using the Auth flow when implemented, or a controlled Supabase Auth client. Management access requires an `aal2` session.
3. From the project directory, bootstrap the first verified owner with `npm run bootstrap:owner -- --user-id VERIFIED_AUTH_UUID --email VERIFIED_EMAIL`. The service-only routine checks the confirmed email and active profile and refuses if an OWNER already exists.

Never derive this UUID or role from editable signup metadata. No default password or sample owner is seeded. Later STAFF linking and ADMIN invitations/grants/revocations are OWNER-only, MFA-protected application workflows. ADMIN activation waits for confirmed email. Direct browser writes to privileged roles are revoked. Ownership transfer is future work; the database protects the last usable owner.

4. Provision one business_settings row, one website_settings row, a published booking_policy_versions row, business hours, staff accounts/roles, services, staff_services and staff working hours. Use explicit business-approved values. Publication defaults to false. Policy rows are append-only: create the next version instead of editing an existing one.
5. Configure Auth site/redirect URLs, email confirmation, SMTP, MFA and abuse controls for the deployment. Guest anonymous Auth signups are not part of this architecture.
6. Configure private/public Storage buckets and validated upload policies only when the upload feature is implemented. No upload access is currently granted.

## Later integrations

The future backend must schedule `expire_due_payments` periodically, implement durable outbox delivery and payment reconciliation, and validate provider facts before `record_verified_payment`. No scheduler or gateway is deployed now. Acceptance/request RPCs perform opportunistic expiration in the meantime.

Approval-required payments must use the stored amount, currency and deadline after acceptance. Checkout should be created only after the acceptance transaction commits. A cancelled/expired pending provider checkout must be invalidated where supported; late funds remain a reconciliation exception. Never confirm from the browser redirect.
