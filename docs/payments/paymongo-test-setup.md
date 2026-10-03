# PayMongo test setup

The application uses PayMongo Hosted Checkout v2 in TEST mode. The API secret is read only by the server adapter. Browser returns never settle a payment; the verified webhook is authoritative.

## Dashboard setup

1. Switch the PayMongo Dashboard to **Test mode**.
2. Deploy the application to a publicly reachable HTTPS preview/staging URL. PayMongo cannot deliver webhooks to localhost or a plain HTTP URL.
3. Open **Developers → Webhooks** (the Dashboard may label this **Settings → Webhooks**), add the endpoint `https://<your-public-host>/api/webhooks/paymongo`, and subscribe to `checkout_session.payment.paid`.
4. Copy the endpoint's TEST webhook secret into the server environment as `PAYMONGO_WEBHOOK_SECRET`. For local work, place it in `.env.local`; never use a `NEXT_PUBLIC_` prefix. Restart the server after changing environment variables. The application starts without this optional value, but the webhook responds with 503 until it is configured.
5. Keep `PAYMONGO_SECRET_KEY` set to the test API key (`sk_test_...`). The adapter rejects live keys in every environment. For a Vercel production runtime used as a public test/demo, also set the server-only `PAYMONGO_TEST_MODE_ENABLED=true`; without that explicit opt-in, checkout remains disabled in production.

## First end-to-end test payment

1. With the app deployed to the public HTTPS test endpoint and webhook secret configured, create a development booking using a service/business currency supported by PayMongo Hosted Checkout.
2. Accept the request so it enters `AWAITING_PAYMENT`, then open the customer account or scoped guest booking and select **Pay online**.
3. Complete the hosted session using PayMongo's current test payment details for a method enabled in the test account.
4. Wait for the `checkout_session.payment.paid` delivery. The app validates the TEST signature and mode, session reference, amount, currency, and paid timestamp before calling the existing payment-settlement RPC.
5. Verify the appointment state in the customer or private guest view. A browser return by itself is not confirmation. An expired booking remains expired and any valid late payment goes to review.

PayMongo retries delivery when the endpoint does not return a 2xx response. Check the Dashboard's webhook delivery record for rejected signatures or unmatched sessions; never paste API or webhook secrets into logs or support messages.
