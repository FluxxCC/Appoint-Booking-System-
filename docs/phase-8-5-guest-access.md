# Phase 8.5 guest access and account ownership

Booking remains account optional. Guest appointments use a customer row without `auth_user_id` and a hashed, appointment-scoped `VIEW` token. A logged-in customer's appointment uses their verified Auth identity and RLS. The two access methods remain independent.

Guest booking access uses a random, 30-day appointment-scoped `VIEW` token in an HttpOnly cookie. PostgreSQL stores its hash; the raw token stays in the browser that submitted the booking. The booking reference is for display and customer-service lookup only. The application does not issue or deliver guest email links, so losing the original browser session requires contacting the business.

Supabase Auth email remains separate from guest booking access and is configured through Supabase Auth SMTP settings.

Phase 9 checkout accepts an appointment context authorized either through the signed-in customer's RLS-backed ownership or the scoped guest `VIEW` cookie. The server rechecks state, amount, currency, deadline, and appointment ownership before starting checkout. The browser payment-return page only offers navigation back to the authenticated account or private guest booking; it does not treat a return from PayMongo as proof of payment.

The current schema has one customer as both booking owner and attendee/contact. Booking for someone else needs separate owner and attendee/contact fields and explicit authorization rules, so the verified account email remains locked for registered bookings. A future claim flow must verify the new account's email and obtain deliberate proof of guest booking control, such as a fresh guest link, before linking historical bookings. Matching an email string alone must never transfer ownership.
