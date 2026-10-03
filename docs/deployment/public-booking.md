# Public website and booking deployment

## Required configuration

The application reads the public Supabase project URL and publishable key from `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Public booking and availability now pass through rate-limited Next.js server boundaries, which call service-role-only RPCs. Configure `SUPABASE_SECRET_KEY` as a server-only application secret. Never prefix it with `NEXT_PUBLIC_` or send it to the browser. Configure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for the shared production rate limiter. Production fails closed if either Redis setting is missing or the provider is unavailable. Configure the custom domain as the site URL and allow the Auth callback/reset URLs described in `authentication-setup.md`.

Before publishing content, set the business name, description, contact details, address, timezone, currency, business hours, latest booking policy, active/published service and staff profiles, service assignments and guest/registration settings. Set the business `published` flag only when the public site should be available. Add marketing images through the existing catalog image workflow. Public routes intentionally return no business/catalog content while the business is unpublished.

## Edge rate limiting

Production rate limits use atomic Redis counters through Upstash REST, shared by every application instance. Availability allows 60 requests per IP per minute; booking submission allows 8 per IP per 15 minutes. IPs are SHA-256 hashed before storage; customer email, phone and booking content are not used in limiter keys. Development/tests use a bounded in-process adapter when Upstash settings are absent. Both sensitive public RPCs revoke anon/authenticated execution; only the protected server boundary's server-only client can execute them. The safe public website/catalog projection and scoped guest-view RPC remain public. Do not trust browser-provided customer IDs or staff assignments as authorization.

## Guest access

Guest booking must be enabled in business settings. Each successful guest request receives a random, HttpOnly browser token; PostgreSQL stores only its hash and expires the grant after 30 days. Keep the browser cookie and public database function unmodified as one security boundary. Appointment UUIDs/reference numbers must never be accepted as access credentials. Phase 7 does not deliver email/SMS access links, support recovery on a second device, cancel, or reschedule.

## Database rollout

Apply `20261001090000_phase_7_server_rate_limit_boundary.sql` to staging before deploying this application version. It revokes browser-role execution on the public availability and booking functions and grants it to `service_role`; it adds server-only RPC wrappers. Do not apply it to the hosted project as part of local development. The first-five migration version IDs still differ from local files, so do not use CLI migration pushes until `docs/deployment/connected-project.md` is reconciled and the deployment owner explicitly authorizes a rollout. Verify the grants, RLS, guest policy, snapshots, scoped token expiration, duplicate retries and Redis behavior in staging before opening booking traffic.

## Launch checks

- Verify only published business/service/staff/announcement content is visible anonymously.
- Verify guest booking can be switched off while registered customers can continue when allowed.
- Verify database rejection for inactive/unpublished services, ineligible staff, stale times and out-of-grid instants.
- Verify PENDING requests do not block time and acceptance still uses the database GiST overlap guard.
- Verify a registered customer cannot submit another customer identity and cannot read another customer's appointment.
- Verify the guest management link fails with only the appointment UUID and succeeds only with the HttpOnly token cookie.
- Verify rate limits from multiple deployed instances and monitor public booking errors without logging guest access tokens or contact data.
- Verify screen-reader labels, keyboard navigation, mobile layout and business-local/DST date behavior.
