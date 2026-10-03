# Phase 8.5 guest access and account ownership

Booking remains account optional. Guest appointments use a customer row without `auth_user_id` and a hashed, appointment-scoped `VIEW` token. A logged-in customer's appointment uses their verified Auth identity and RLS. The two access methods remain independent.

The public `BK-` reference is for display and email recovery only. Recovery requires email plus reference, returns the same public response for a match and non-match, and sends a 15-minute, single-use link to the booking email when delivery is configured. The link's fragment carries a 256-bit credential, which the browser removes before POST exchange. The server exchanges it for a hashed, 30-day `VIEW` token in an HttpOnly cookie. Expired, consumed, and revoked links cannot be exchanged. The existing guest token revocation mechanism can invalidate access.

`RESEND_API_KEY` and `RESEND_FROM_EMAIL` enable transactional delivery. Missing or failed delivery never rolls back a successful booking. The original browser retains its scoped access; the confirmation page reports email availability. If that browser access is lost while email is unconfigured, the guest must contact the business. Email link delivery should be checked before treating cross-device recovery as operationally ready.

Phase 9 checkout should accept an appointment context authorized either through the signed-in customer's RLS-backed ownership or the scoped guest `VIEW` cookie. Both branches should call one server-side payment-domain operation that rechecks state, amount, currency, deadline, and appointment ownership before starting checkout. No checkout is implemented in this phase.

The current schema has one customer as both booking owner and attendee/contact. Booking for someone else needs separate owner and attendee/contact fields and explicit authorization rules, so the verified account email remains locked for registered bookings. A future claim flow must verify the new account's email and obtain deliberate proof of guest booking control, such as a fresh guest link, before linking historical bookings. Matching an email string alone must never transfer ownership.
