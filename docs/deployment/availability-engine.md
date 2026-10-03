# Availability deployment and operations

Phase 6 adds one local migration: `20260930103459_availability_engine.sql`.

The connected project has Phase 5 and Phase 6 migrations applied. Its migration history is recorded in `connected-project.md`; resolve the earlier five-version mismatch before using CLI migration pushes. Review the live schedule and availability behavior with configured business data before opening booking traffic.

## Interface

`GET /api/availability?service=<uuid>&date=YYYY-MM-DD&staff=<optional uuid>` returns local-date availability without caching. Omitting staff asks for any available team member. Results contain UTC instants, business-local time, eligible staff public IDs/names and a deterministic recommendation. The public response never contains appointment/customer rows or private staff contacts.

The admin route `/admin/availability` adds diagnostics only after the normal live owner/admin MFA guard and an independent SQL authorization check.

The endpoint includes a process-local request cap. Configure Vercel Firewall/WAF distributed limits for `/api/availability` before public launch; process memory is not shared across serverless instances.

## Operational constraints

- Slots are advisory. The later submission must calculate a fresh eligible staff choice. The request function also rejects starts outside the current configured slot interval.
- PENDING requests do not reserve time. Acceptance remains protected by the schedule lock, live validation and GiST exclusion constraint.
- Payment deadlines are expired explicitly. A due AWAITING_PAYMENT is omitted from availability, while request/acceptance performs opportunistic expiry. Keep the independent periodic expiry worker on the launch checklist.
- Duration, buffers, staff assignment, business/staff hours, closures and exceptions come from PostgreSQL. A future booking UI must not supply authoritative price or duration.
- One location per installation and one service per appointment remain current schema limits. No staff duration override exists.
- `Asia/Manila` is a test fixture only. Configure a real IANA timezone and exercise its DST boundaries where relevant.

## Staging checks

1. Apply migrations only after history reconciliation and verify function grants/search paths and RLS policies.
2. Run `EXPLAIN (ANALYZE, BUFFERS)` for representative service/day/staff counts; existing schedule indexes should serve the expected initial business size.
3. Inspect public JSON anonymously. Try private contacts, auth IDs, appointments, prices and roles; none should be returned.
4. Verify inactive services/categories, nonbookable staff, missing assignments, closed days, split shifts, closures, breaks, buffers, awaiting-payment blocks and expired deadlines.
5. Use separate authenticated sessions to submit two pending requests and attempt acceptance. Confirm one conflicting acceptance succeeds and the other rolls back; then test cancellation and reacquisition.
6. Confirm admin diagnostics return 403 without live AAL2 admin and contain no customer details.
7. Exercise date boundaries in the deployment timezone and configure Vercel Firewall/WAF limiting before public exposure.

