# PayMongo Hosted Checkout setup

The application uses PayMongo Hosted Checkout v2. API keys and webhook signing secrets are read only by the server adapter. Browser returns never settle a payment: the server verifies the Checkout Session with PayMongo, and signed webhooks can settle the same idempotent record.

## Dashboard setup

1. Switch the PayMongo Dashboard to **Test mode**.
2. Deploy the application to a publicly reachable HTTPS preview/staging URL. PayMongo cannot deliver webhooks to localhost or a plain HTTP URL.
3. Open **Developers → Webhooks** (the Dashboard may label this **Settings → Webhooks**), add the endpoint `https://<your-public-host>/api/webhooks/paymongo`, and subscribe to `checkout_session.payment.paid`.
4. Copy the endpoint's TEST webhook secret into the server environment as `PAYMONGO_WEBHOOK_SECRET`. For local work, place it in `.env.local`; never use a `NEXT_PUBLIC_` prefix. Restart the server after changing environment variables. The webhook responds with 503 until a matching signing secret is configured.
5. Keep `PAYMONGO_SECRET_KEY` set to the test API key (`sk_test_...`). In a Vercel production runtime, set `PAYMONGO_TEST_MODE_ENABLED=true`; test checkout remains disabled in production without that opt-in.

## First end-to-end test payment

1. With the app deployed to the public HTTPS test endpoint and webhook secret configured, create a development booking using a service/business currency supported by PayMongo Hosted Checkout.
2. Accept the request so it enters `AWAITING_PAYMENT`, then open the customer account or scoped guest booking and select **Pay online**.
3. Complete the hosted session using PayMongo's current test payment details for a method enabled in the test account.
4. Wait for the `checkout_session.payment.paid` delivery. The app validates the TEST signature and mode, session reference, amount, currency, and paid timestamp before calling the existing payment-settlement RPC. The return page also asks PayMongo's server API for the session status while the signed webhook is pending.
5. Verify the appointment state in the customer or private guest view. A browser return by itself is not confirmation. An expired booking remains expired and any valid late payment goes to review.

PayMongo retries delivery when the endpoint does not return a 2xx response. Check the Dashboard's webhook delivery record for rejected signatures or unmatched sessions; never paste API or webhook secrets into logs or support messages.

## Production LIVE payments

Keep the public test/demo deployment in TEST mode. For a separate production environment that is authorized to charge customers:

1. Complete the merchant's PayMongo live-account onboarding and use its LIVE secret API key (`sk_live_...`).
2. In the PayMongo Dashboard's **Live mode**, register `https://<production-host>/api/webhooks/paymongo` and subscribe to `checkout_session.payment.paid`. Test and live webhook endpoints are separate and have separate signing secrets.
3. In the production Vercel environment only, set `PAYMONGO_SECRET_KEY` to the LIVE key, `PAYMONGO_WEBHOOK_SECRET` to that LIVE endpoint's signing secret, and `PAYMONGO_LIVE_MODE_ENABLED=true`. Remove or set `PAYMONGO_TEST_MODE_ENABLED` to `false`. Keep all three variables server-only.
4. Redeploy after adding the variables. The adapter requires the LIVE key prefix, explicit live-mode opt-in, a production runtime, and matching `livemode` webhook/session facts. A test key and live key cannot be mixed in the same deployment configuration.
5. Validate the deployment with PayMongo's webhook test/delivery tools and read-only verification. Do not use a real customer charge as a configuration test; a real transaction requires a separate business-approved acceptance plan.

Live refunds are not automated by this adapter. Refunds must be reviewed and processed through the merchant's PayMongo account, then recorded by the business. The public refund page displays the business policy saved in **Admin → Business settings**.
