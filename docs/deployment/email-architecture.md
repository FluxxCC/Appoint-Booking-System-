# Email architecture and deployment

The application has two deliberately separate email paths. Application notifications use the server-only Resend API abstraction and the existing `notification_outbox`; Supabase Auth creates and verifies every Auth token and continues to send its Auth messages through its own SMTP configuration. The application never creates password-reset, email-confirmation, invitation, or email-change tokens.

## Email flow inventory

| Event | Recipient | Sender system | Trigger authority / status |
| --- | --- | --- | --- |
| Customer confirmation, resend, password recovery, staff/admin invitation, email-change verification (when enabled) | Auth user | Supabase Auth → configured SMTP | Supabase Auth action and templates; SMTP must be configured in the Supabase Dashboard |
| Guest booking recovery | Matching guest booking email | Next.js server → Resend API | Rate-limited recovery action; trusted RPC validates email/reference and issues an expiring single-use scoped link |
| Booking submitted | Verified customer email or stored guest booking email | Outbox → Next.js server → Resend API | Committed `PENDING` appointment event |
| New request under ADMIN_APPROVAL | Active, verified OWNER/ADMIN profiles | Outbox → Next.js server → Resend API | Committed `PENDING` event and live `user_roles`/active profile/Auth email checks |
| New request under STAFF_APPROVAL | Assigned linked active STAFF account only | Outbox → Next.js server → Resend API | Committed `PENDING` event and current staff/profile/Auth email checks |
| Booking declined | Verified customer email or stored guest email | Outbox → Next.js server → Resend API | Committed `DECLINED` event |
| Accepted booking awaiting payment | Verified customer email or stored guest email | Outbox → Next.js server → Resend API | Committed `AWAITING_PAYMENT` event; includes required amount, deadline, and scoped CTA |
| PAY_AT_BUSINESS or other non-payment confirmation | Verified customer email or stored guest email | Outbox → Next.js server → Resend API | Committed `CONFIRMED` event without a successful online payment |
| Online payment confirmed | Verified customer email or stored guest email | Outbox → Next.js server → Resend API | `CONFIRMED` event plus a successful, non-exception payment recorded by the verified settlement RPC |
| Payment window expired | Verified customer email or stored guest email | Outbox → Next.js server → Resend API | Committed `PAYMENT_EXPIRED` event |
| Cancellation | Verified customer email or stored guest email | Outbox → Next.js server → Resend API | Committed `CANCELLED` event |
| Late payment requiring review | Configured business contact email | Outbox → Next.js server → Resend API | Durable exception row plus successful payment with `LATE_PAYMENT_REVIEW` |

No separate email is sent for the transient `ACCEPTED` state: acceptance commits that intermediate event with its final `AWAITING_PAYMENT` or `CONFIRMED` state, and the final state sends the customer message. Appointment completion, rescheduling, reminders, refunds, and a persisted trustworthy failed-payment notification are not currently implemented and therefore do not send email. The PayMongo return page is not an email trigger. No preference store exists yet; operational email defaults are limited to authorized active recipients for the relevant approval mode. OWNER/ADMIN operational mail contains only appointment reference, service, assigned staff, time and review link; it does not include customer contact details. Staff mail is limited to the assigned linked active staff member.

## Application transactional delivery

`src/server/email/client.ts` validates message shape and sender, supports `Name <email@domain>`, rejects malformed/header-injection sender values, and calls the Resend API. `src/server/email/send-email.ts`, templates, guest link handling, and the outbox dispatcher are `server-only`. The API key is never passed to a Client Component and no arbitrary-recipient endpoint is exposed.

The appointment/event or verified payment transaction writes its outbox row atomically. The worker leases rows with service-role-only RPCs and sends only after commit. It re-reads authoritative appointment, payment, customer/staff link, profile, Auth verification, role, and business state before selecting recipients. Registered customers receive mail only at the confirmed Auth email linked to the authorized customer record; browser-submitted alternate addresses are ignored. Guests use the booking contact email recorded by the trusted booking operation and appointment-scoped expiring credentials. Raw tokens exist only in the email link fragment and are not stored in the outbox or logged.

Resend receives a stable idempotency key derived from the event, recipient and notification role. This covers duplicate event processing and provider retries; an outbox acknowledgment failure safely retries with the same provider key. Transient provider/network failures return to `PENDING` with bounded exponential backoff; permanent/configuration/recipient failures are recorded as safe categories and stop retrying. After eight attempts, retryable jobs become `FAILED`. Delivery occurs after the authoritative transaction, so email failure never rolls back a booking or payment. The dispatcher response contains counts only and no recipient, token, provider response body, or secret.

## Local configuration

Set these in the ignored local `.env.local` file:

| Variable | Purpose | Visibility |
| --- | --- | --- |
| `RESEND_API_KEY` | Resend API authorization for application notifications | Server-only secret |
| `RESEND_FROM_EMAIL` | Verified sender, optionally `Display Name <address>` | Server-only configuration |
| `NEXT_PUBLIC_SITE_URL` | Origin used to construct links in emails and Auth redirects; use `http://localhost:3000` locally | Public URL, not a credential |
| `CRON_SECRET` | High-entropy bearer secret protecting `/api/cron/notifications` | Server-only secret |

Vercel Hobby hosts the application. It does not schedule transactional outbox delivery: dispatch requires an external scheduler capable of calling `/api/cron/notifications` at the desired interval. Send `Authorization: Bearer <CRON_SECRET>` with every request; the dispatcher rejects missing or invalid credentials. This repository does not select or integrate a scheduler provider. Do not configure a Vercel Cron schedule for this endpoint on Hobby. Local `next dev` does not run a scheduler automatically; a developer may invoke the protected route locally with the local cron secret to drain test outbox entries. Tests use mocks and do not send real email. See [Vercel Cron management and limits](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

The current production application origin is `https://appointmentdemo.zentra.surf`; set `NEXT_PUBLIC_SITE_URL` to that exact origin in Vercel Production. Preview deployments should use their intended HTTPS origin and matching Auth allow-list entry. Reusable code calls `siteUrl()` and does not hardcode the production hostname. Production links reject non-HTTPS origins.

## Configure Resend for Supabase Auth (manual dashboard step)

The application API key and SMTP credential serve different paths. `RESEND_API_KEY` in Next.js authorizes server-side application notification API calls. Supabase SMTP is configured inside Supabase and carries Supabase-generated Auth messages; no SMTP password belongs in `.env.local` or Vercel.

1. In the Resend Dashboard, confirm the sending domain is verified and create/use an API key allowed to send from that domain.
2. In the Supabase Dashboard, open **Authentication → SMTP Settings** and enable custom SMTP.
3. Enter the current Resend SMTP settings from [Resend's official SMTP documentation](https://www.resend.com/changelog/smtp-service): host `smtp.resend.com`, port `465` with SSL/TLS, username `resend`, password the Resend API key, and a sender address/name on the verified domain. The development sender previously confirmed in this project is `Zentra Bookings <bookings@notifications.zentra.surf>`; verify that it remains available as a sender in Resend. Treat the password as a secret in the dashboard; never put it in app variables or source control.
4. Save, then use Supabase's supported Auth email test/workflow and manually confirm delivery. Configure provider rate limits for the expected traffic.
5. In **Authentication → URL Configuration**, set the production Site URL to `https://appointmentdemo.zentra.surf` and allow the actual callback URLs used by this app: `https://appointmentdemo.zentra.surf/auth/callback`, `https://appointmentdemo.zentra.surf/auth/callback?next=/reset-password`, and `https://appointmentdemo.zentra.surf/auth/confirm`. Add local/preview origins only in their corresponding development/test project or deliberately scoped allow-list entries.
6. Keep the repository-managed confirmation, recovery and invite templates aligned with the configured callback paths. Supabase Auth sends confirmation, recovery, invitation/account setup, and email-change verification messages when those features are enabled; see [Supabase Auth SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Auth email templates](https://supabase.com/docs/guides/auth/auth-email-templates), and [redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls).

This repository does not change hosted Supabase SMTP, URL allow-lists, or email templates automatically. The local `supabase/config.toml` intentionally keeps local Auth testing on the Supabase local email capture service and uses `http://localhost:3000` as its local site URL.

## Deployment and manual verification

Before enabling production notifications:

- Apply the pending migration `20261003084211_transactional_email_outbox.sql` through the established reviewed deployment process. It adds only service-role-only lease/acknowledgment functions over the existing outbox; it does not execute queued mail or modify existing appointment/payment data.
- Add `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_SITE_URL`, and `CRON_SECRET` to Vercel Production. Add the appropriate site URL and secrets separately to Preview only if Preview email sending is intentionally enabled.
- Configure Supabase Auth SMTP and production URL allow-lists manually as above.
- Trigger one development booking/payment lifecycle and inspect a sanitized dispatcher result. Confirm provider acceptance and inbox arrival manually; automated suites must never send live messages.
- Configure an external scheduler to call `/api/cron/notifications` at the desired interval with `Authorization: Bearer <CRON_SECRET>`. Confirm unauthorized calls receive `401`. This repository does not configure or integrate a scheduler provider.

Keep Supabase Auth as the only issuer/verifier of Auth links, and keep payment notifications downstream of verified server-side settlement. Never log API keys, SMTP credentials, Auth tokens, guest link tokens, customer message bodies, or Resend response bodies.
