# Deferred appointment rescheduling

Phase 8 keeps the requested time and its price, service, duration, buffers, and policy snapshot immutable. The approval transaction revalidates those values before acquiring a slot. Changing a time through a generic update would bypass that invariant, so rescheduling is deferred.

An OWNER or ADMIN command for a **PENDING** request should take the appointment ID, a proposed start time, and an explicit reason. It should lock the schedule and appointment, recheck the booking window, current business and staff hours, closures, exceptions, staff eligibility, duration, buffers, and occupied range, then atomically update the interval and append an appointment event and audit entry. The existing overlap exclusion constraint remains the final authority. The customer should see the new requested time and a clear history entry. Repeated commands need an idempotency key.

For an accepted or confirmed booking, rescheduling needs a separate policy: preserve the original reservation until the new interval is acquired, then release it in the same transaction; account for payments and deadlines; and define whether staff or customer consent is required. That policy is outside Phase 8. No client may directly update an appointment interval.
