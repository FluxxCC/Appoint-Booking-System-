# Public test/demo deployment

This project is prepared for `https://appointmentdemo.zentra.surf` as a public test/demo deployment. Do not enable PayMongo live mode or enter live credentials. This Vercel production runtime will use the existing development/test Supabase project, so demo bookings and customer records will be written to that shared test database.

## Environment variables

Configure these in the Vercel project's **Production** environment before its first deployment. Never copy secret values into Git, chat, or client-side variables.

| Variable | Classification | Required for | Current local status |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase client and server requests | Configured |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Browser Supabase client | Configured |
| `NEXT_PUBLIC_SITE_URL` | Public origin | Callback, guest email and payment return URLs | Configured as localhost; set to the demo HTTPS origin in Vercel |
| `SUPABASE_SECRET_KEY` | Server-only | Trusted booking, availability, Auth administration and webhook database operations | Configured |
| `UPSTASH_REDIS_REST_URL` | Server-only | Shared production rate limiting | Missing locally; required before public deployment |
| `UPSTASH_REDIS_REST_TOKEN` | Server-only | Shared production rate limiting | Missing locally; required before public deployment |
| `PAYMONGO_SECRET_KEY` | Server-only | PayMongo TEST Hosted Checkout | Configured with a TEST key |
| `PAYMONGO_TEST_MODE_ENABLED` | Server-only feature flag | Explicitly enable PayMongo TEST Checkout in a Vercel production runtime | Missing locally; set to `true` in the Vercel demo environment |
| `PAYMONGO_LIVE_MODE_ENABLED` | Server-only feature flag | Enable LIVE PayMongo only in a separate, intended production payment environment | Leave unset/false for this public test/demo |
| `PAYMONGO_WEBHOOK_SECRET` | Server-only | Accept signed PayMongo TEST webhooks | Not configured; obtain after registering the TEST webhook |
| `RESEND_API_KEY` | Server-only | Guest recovery and transactional email | Configured locally |
| `RESEND_FROM_EMAIL` | Server-side sender identity | Guest recovery and transactional email | Configured locally with the verified Zentra sender |

`PAYMONGO_TEST_MODE_ENABLED=true` is a strict production opt-in. Checkout still requires a key with the TEST prefix; live keys are rejected even when this flag is enabled. This flag does not enable live payments. Keep this demo connected to the development/test Supabase project and do not enable LIVE charges here. Live deployment configuration is documented in `docs/payments/paymongo-test-setup.md`.

`RESEND_API_KEY` and `RESEND_FROM_EMAIL` are optional for basic browsing and booking, but required for guest recovery and application transactional email. Supabase Auth confirmation, recovery and invitation email delivery is configured separately in Supabase Dashboard → Authentication → SMTP Settings; it does not use the Resend API variables above.

`SUPABASE_PROJECT_ID` is used for CLI workflows and is not needed by the deployed application. `PLAYWRIGHT_TEST`, `E2E_SUPABASE_PORT`, `E2E_RESEND_URL`, and `ADMIN_VISUAL_QA` are test/QA settings and must not be added to Vercel. `NODE_ENV` is supplied by Vercel.

## Vercel deployment

The repository uses the standard Next.js application output. There is no `vercel.json` override or static-export setting. Vercel should detect Next.js automatically, install from `package-lock.json`, and run `npm run build`; do not set a static output directory. The project requires Node.js 22 or newer. The checkout and webhook handlers use the Node.js runtime.

The current workspace has no `.git` directory. For a Git-connected Vercel project, first publish the project to a Git provider, then import that repository in Vercel. Alternatively, use the Vercel CLI from the project root after signing in and linking the project. Do not deploy until the required rate-limiter variables are configured.

Before the first deployment:

1. Create or select the Vercel project and confirm its root directory is the repository root.
2. Add the environment variables in the table above that are available. Use the existing development/test Supabase project URL and publishable key, its server-only secret, the PayMongo TEST secret key, `PAYMONGO_TEST_MODE_ENABLED=true`, both Upstash values, and the existing verified Resend sender configuration.
3. Set `NEXT_PUBLIC_SITE_URL` to `https://appointmentdemo.zentra.surf`.
4. Leave `PAYMONGO_WEBHOOK_SECRET` unset until the endpoint has been registered in PayMongo TEST mode. Webhook calls return a safe service-unavailable response until it is configured; unrelated pages continue to work.
5. Deploy a preview first and confirm the app loads. Then deploy the public demo once the rate limiter and environment are ready. Keep `PAYMONGO_LIVE_MODE_ENABLED` unset/false.

Any change to a Vercel environment variable requires a new deployment to take effect.

## Attach the custom domain

After a Vercel project/deployment exists:

1. In Vercel Project Settings → Domains, add `appointmentdemo.zentra.surf`.
2. Use the exact DNS record type, host/name and value Vercel displays for this project. Do not guess a target and do not change the `zentra.surf` apex records, mail records, or unrelated DNS entries.
3. Add only the requested subdomain record in the DNS provider for `zentra.surf`.
4. Wait for Vercel to verify the domain and issue HTTPS. Confirm the deployment opens at `https://appointmentdemo.zentra.surf` before registering the webhook.

## Supabase Auth URL configuration

On the existing development/test project, use Authentication → URL Configuration:

- Set **Site URL** to `https://appointmentdemo.zentra.surf` for the deployed demo.
- Add `https://appointmentdemo.zentra.surf/**` to the redirect allow list. The app uses `/auth/callback`, `/auth/callback?next=/reset-password`, and `/auth/confirm` for PKCE, password recovery, signup confirmation and invitations.
- Keep the existing localhost redirect pattern so local development at `http://localhost:3000` continues to work.
- Do not change SMTP settings as part of URL setup. If hosted Auth emails must work for public testing, separately review Authentication → SMTP Settings and configure a custom SMTP service there. The application's Resend API key is not an SMTP password.

The MFA flow is application-local and has no separate external callback URL. The existing in-app `/auth/mfa` route remains protected by the current authorization checks.

## PayMongo TEST webhook and lifecycle check

After HTTPS is active:

1. Switch the PayMongo Dashboard to TEST mode.
2. Under Developers → Webhooks, add `https://appointmentdemo.zentra.surf/api/webhooks/paymongo` and subscribe to `checkout_session.payment.paid`.
3. Copy that endpoint's TEST signing secret into Vercel as `PAYMONGO_WEBHOOK_SECRET` (server-only), then redeploy.
4. Create a disposable guest TEST booking, approve it if the business requires approval, and select **Pay online** after it reaches `AWAITING_PAYMENT`. This creates a checkout that can be matched to the application’s pending payment; an unrelated synthetic paid event may be rejected because it has no matching checkout.
5. Complete the hosted checkout using the PayMongo TEST payment details. The browser return alone never confirms payment; a server-side PayMongo session check or the signed webhook must verify and settle it.
6. Verify PayMongo’s webhook delivery record and the payment and event records, guest booking status, admin payment view, and transactional confirmation email. Redeliver the same event and confirm it has no duplicate settlement effect. Do not test with a live payment method or live credential.

## Security and serving behavior

- Supabase session cookies are set `Secure` in production, `SameSite=Lax`, and remain non-HttpOnly for the Supabase browser client. Guest booking access cookies are `Secure`, `HttpOnly` and `SameSite=Lax` in production.
- Account, admin and staff areas require server authorization, render dynamically, are not cached, and include `noindex`. Private guest booking, booking confirmation and payment return pages also include `noindex`.
- The application has no PWA manifest or service worker. Public site URLs are built from `NEXT_PUBLIC_SITE_URL`; no deployment hostname is hardcoded into application code.
- Production rate limiting fails closed if Upstash is missing or unavailable. Do not bypass it for a public demo.
