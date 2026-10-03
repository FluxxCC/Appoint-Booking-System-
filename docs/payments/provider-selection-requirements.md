# Payment provider selection requirements

This application has a provider-neutral appointment payment ledger and durable checkout-attempt preparation, but no selected gateway, checkout route, webhook endpoint, or live refund adapter. Provider selection is a separate decision; this document records the requirements to use when comparing current provider capabilities.

## Required capabilities to verify with current provider documentation

- The merchant can be onboarded and settle funds to a Philippine business.
- The intended checkout supports PHP and the business's selected channels. Check GCash, Maya, and cards separately; do not assume availability from a provider's general marketing page.
- Hosted checkout or an equivalent provider-hosted payment experience is available, so this application does not collect or store card details.
- A server API can create checkout sessions and return a provider reference and redirect URL.
- The API supports idempotency for checkout creation and refund requests, or documents a safe equivalent.
- Signed/authenticated webhooks expose enough verified event data to match a payment, amount, currency, status, and event identifier.
- The provider offers a sandbox/test environment and documents how test events are generated and replayed.
- Server integration is practical from a Next.js Node.js route or server-only adapter.
- The payer can complete checkout without registering for an account with this application. Any account or wallet requirement imposed by a payment channel must be identified explicitly.
- The provider supports full refunds and clarifies whether partial refunds are supported, their limits, timing, and settlement effects.
- Philippine merchant onboarding requirements, business documents, supported business types, fees, payout schedule, reserves, settlement currency, and dispute/chargeback handling are documented and acceptable.

## Comparison record to complete before selection

For each candidate, record the date and link to current official documentation for: merchant eligibility, PHP settlement, each channel (GCash/Maya/cards), hosted checkout, guest payer requirements, checkout/refund idempotency, webhook authentication and event ordering, sandbox coverage, refund limits, fees, payout timing, reserves, disputes, and Next.js server integration. Keep uncertain or sales-confirmation items marked as unresolved. Do not rely on repository notes or older provider comparisons as evidence of current availability or pricing.

## Application payment rules any adapter must preserve

1. The appointment's immutable `required_payment_amount`, `currency`, and `payment_due_at` are authoritative; all amounts are integer minor units.
2. Registered customers prove ownership through the authenticated customer mapping and RLS-backed data. Guests prove access with the Phase 8.5 scoped, unexpired `VIEW` token. Both then use the same appointment/payment domain operation.
3. The provider request uses an idempotency key retained with the internal payment attempt. `prepare_payment_attempt` serializes preparation and a repeated request reuses the active attempt and key. The provider call occurs after that transaction, so the selected provider must honor the same idempotency key on retries.
4. Only raw, authenticated provider events (or a separately authenticated provider status lookup) can reach the service-role payment verifier. Browser return parameters are display hints only.
5. Provider/event identity is deduplicated. Payment verification and appointment transition stay transactional. Out-of-order non-success events must never reverse a verified success.
6. A payment received after reservation expiry is recorded for manual review; it never restores the expired appointment or takes a slot that another booking acquired.
7. Refunds are recorded against a succeeded payment, bounded by the remaining refundable amount, and later sent through an idempotent provider adapter. Resend delivery is an after-commit notification and never part of payment correctness.

## Later operational work

After selecting a provider, verify merchant onboarding and sandbox behavior first. Then design provider-specific server-only configuration and an adapter, confirm the additive attempt fields meet that provider's documented checkout needs, add a raw-body authenticated webhook route, and test duplicate, reordered, invalid-signature, timeout, retry, and late-payment cases before enabling the Pay online action. Production expiration still needs a monitored scheduled trigger for `expire_due_payments()`; current request/availability flows also opportunistically expire overdue reservations.

## Payment email events for a later adapter

- Payment required after staff acceptance, including amount and deadline.
- Payment verified and appointment confirmed.
- Payment failed only when a definitive failure is useful to the customer; do not treat an abandoned redirect as failure.
- Payment window expired.
- Refund submitted/processed, distinguishing pending from succeeded.

Email delivery must be asynchronous or best-effort after the authoritative database transaction.
