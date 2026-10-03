# Phase 6 — availability engine

Implemented over existing business/staff hours, catalog eligibility, closures, schedule exceptions, booking policy and appointment occupied ranges. The engine returns advisory options; request creation and staff acceptance remain transactional and authoritative.

## 1. Availability architecture

`public.availability_for_date` invokes a narrowly scoped private calculation. It accepts service UUID, business-local date and optional staff UUID. It returns safe JSON; arbitrary times are not persisted. `/api/availability` exposes a validated, uncached GET. The admin inspector uses the same calculation and can opt into restricted diagnostics.

## 2. Files created / modified

Created:

- `supabase/migrations/20260930103459_availability_engine.sql`
- `src/features/availability/schemas.ts`, `inspector.tsx`, `rate-limit.server.ts`
- `src/app/api/availability/route.ts`
- `src/app/(admin)/admin/availability/page.tsx`
- `scripts/test-availability-database.mjs`
- `tests/unit/availability-input.test.ts`
- `docs/deployment/availability-engine.md` and this report.

Modified:

- `src/types/database.generated.ts` 
- `package.json`: added the availability database suite to `test:db`.
- `scripts/test-database.mjs`: keeps its overlap and adjacency cases on the configured scheduling grid.
- README, architecture and connected-project deployment notes.

## 3. Business / staff intersection

Candidate starts originate only at each business-hour interval opening, stepped by configured scheduling interval. The occupied interval including service buffers must fit wholly inside a business interval and either one staff work interval or an EXTRA_HOURS exception. Staff must be active, published, bookable and actively assigned to the active/published service. Split intervals remain separate; days without rows are closed/off.

## 4. Duration / buffers

The database reads current service duration and buffers; browser input cannot override them. End times use elapsed duration in timestamptz. The buffer-inclusive half-open occupied range must fit local business/staff bounds, avoid closures/exceptions and not overlap reserved appointment ranges. The entire service must fit before closing. Starts remain on the configured scheduling grid, independent of service duration. No staff duration override exists in the current schema.

## 5. Closures / exceptions

Full- and partial-day closures and UNAVAILABLE breaks/leave remove overlapping occupied intervals. EXTRA_HOURS expands staff hours only inside business hours; UNAVAILABLE and business closures still win. Date boundaries and weekday schedules use the configured IANA timezone.

## 6. Appointment blocking

The availability function uses the exact partial GiST exclusion list: ACCEPTED, AWAITING_PAYMENT, CONFIRMED, CHECKED_IN, IN_PROGRESS, COMPLETED and NO_SHOW. It ignores AWAITING_PAYMENT once its deadline has elapsed, as expiry is an explicit state update. PENDING, DECLINED, CANCELLED and PAYMENT_EXPIRED do not block. Request and acceptance operations expire overdue reservations and recheck eligibility/schedule. Two pending requests may coexist; only one conflicting acceptance can acquire the protected interval.

## 7. Any Available Staff

Each returned time lists eligible public staff IDs and display names. The database recommends the member with the fewest nonexpired blocking appointments on that local date, with UUID ascending as a deterministic tie-break. PENDING does not increase load. This is a recommendation, never an assignment or reservation. The later booking operation must rerun selection under the schedule lock and pass the selected staff through the existing request/acceptance checks.

## 8. Timezone handling

The request date and recurring hours are interpreted in business-local time; output `starts_at` / `ends_at` are timestamptz plus a local `HH:MM` label. Nonexistent and ambiguous local start/end wall times are suppressed rather than guessed. DST crossing uses elapsed service minutes. Request creation checks business-local weekday and slot grid again.

## 9. Availability API

`GET /api/availability?service=<uuid>&date=YYYY-MM-DD&staff=<optional uuid>` is public and returns the service summary, timezone, slot interval and eligible slots without price, contact details, appointment records, auth IDs or role assignments. Invalid input is bounded and fails with a safe error. `Cache-Control: no-store` avoids stale slot responses. A per-process 60-request/minute guard is best-effort.

The additive replacement of `private.request_appointment` verifies the start still matches a business opening interval's configured grid, then preserves the original booking and lifecycle checks. Staff acceptance rechecks live eligibility and final schedule reservation. No booking UI was added.

## 10. Admin inspection tool

`/admin/availability` supports service, optional staff/Any Available Staff and business-local date. It displays actual times, eligible staff and the deterministic recommendation. An opt-in diagnostics request requires live admin MFA and adds hours, closures, exceptions and blocking intervals. It does not expose appointment customer details.

## 11. Performance

The query processes one service/date, uses set-oriented candidate generation rather than a database round-trip per slot, preaggregates daily staff loads and uses the existing `(staff_id, starts_at)`, `(starts_at)` and GiST overlap indexes. The date and result are limited to one local day. No Redis/cache layer or new slot table was introduced.

The in-memory request guard is not shared across Vercel instances. Apply a Vercel Firewall/WAF rule for distributed rate limiting before public launch.

## 12. Tests / validation

The Phase 6 SQL suite passes 45 checks, including normal/closed days, split business/staff shifts, 30/45/120-minute duration, close boundaries, buffers, partial closures, leave, breaks, extra hours, public staff eligibility, DST gaps/folds, any-staff results, PENDING/AWAITING_PAYMENT/CONFIRMED/cancelled/declined behavior, interval-grid rejection and competing acceptance/cancellation. The Phase 2–5 database suites contribute 204 more checks, for 249 total.

Application tests: 54 pass across 11 files, covering input validation, rate limiting, RPC routing, diagnostics authorization and cache headers. ESLint, TypeScript and the production build pass. Hosted checks remain pending.

## 13. Database changes

One additive migration adds availability functions and replaces `private.request_appointment` with its existing Phase 5 body plus a slot-grid check. It reuses current tables, indexes, locks and exclusion constraint; no columns or tables were added. Public wrappers are SECURITY INVOKER. The calculation is a narrow SECURITY DEFINER in the unexposed private schema, with fixed empty search path, no writes and an allowlisted JSON projection.

## 14. Remaining limitations

- Rate limiting is per process; enforce a deployment-level WAF/firewall rule for distributed public traffic.
- Expired payment rows are released by the existing request/acceptance/expiry mechanism. An independent expiry job remains needed to keep state timely.
- A request is only pending, not a reservation; availability can change before staff acceptance.
- Hosted PostgREST plans, real Auth sessions, WAF and multi-session races require staging verification.
- Staff-specific duration/price overrides, overnight services, multiple services per visit and locations are unsupported by the current schema.

## 15. Phase 7 prerequisites

- Build the registered and guest customer booking experience on this interface.
- For Any Available Staff, recalculate at submission and create the PENDING request using the fresh deterministic recommendation; acceptance remains the reservation point.
- Present pending status clearly and never collect a deposit/full payment before staff acceptance.
- Connect payment provider only after acceptance, with verified callbacks, deadline processing, idempotency and reconciliation.
- Configure distributed rate limiting, preserve migration history via the documented Supabase connector workflow until version reconciliation, inspect Supabase advisors/query plans after representative traffic, and run native concurrent-session tests before launch.



