# Phase 4 deployment and configuration

Apply the ordered migrations to a staging Supabase project before deploying this UI. The additive migration is `supabase/migrations/20260930080239_admin_configuration.sql`. Earlier migrations are unchanged. No hosted project was modified during development.

1. Complete the existing authentication guide: environment, redirects, SMTP/templates, verified owner bootstrap and TOTP. No new environment variables or dependencies are required by Phase 4.
2. Review existing weekly hours for overlaps before applying the new exclusion constraint. Resolve any genuine overlapping rows deliberately; the migration fails rather than silently rewriting them. On an existing database, test migration and rollback/restore procedures on a backup first.
3. Apply the migration with the normal Supabase release workflow. Keep private out of exposed Data API schemas. Regenerate Supabase types after linking the project; checked-in types currently come from embedded PostgreSQL introspection.
4. Run managed database advisors and API-level allow/deny tests for OWNER/ADMIN with and without aal2, staff, customers, anonymous access and disabled profiles. This phase's admin RPCs use SECURITY INVOKER and need no secret-key client. No new privileged data view was created.
5. Sign in as OWNER/ADMIN with MFA. Save business identity, IANA timezone, ISO currency and booking policy terms. Currency/timezone cannot change after appointments exist. Save weekly hours; a day without intervals is closed. Multiple intervals are supported, with up to four per day in the UI. Overnight hours are not supported by the existing availability model.
6. Verify that a same-hours save succeeds with active appointments, while narrowing hours or adding an intersecting closure fails and rolls back. Repeat with concurrent native sessions against acceptance and payment verification; PGlite covers constraints/transactions but cannot establish managed multi-session behavior.
7. Verify full-day and partial closures in the chosen timezone, including DST transitions where applicable. Ambiguous or nonexistent wall times fail safely. Closure ends are exclusive; a full-day closure ends at the next local midnight, which need not be exactly 24 elapsed hours later.
8. Test announcement create/edit/publish/unpublish/delete, display windows and anonymous visibility. Existing published/start/end RLS is preserved; no archive column was invented. Unpublish keeps a draft; confirmed deletion removes the row and leaves the existing management audit entry. Content is plain text rendered by React, not arbitrary HTML.
9. Verify registration disabled through both the application and a direct Auth signup request. New self-registration must fail without leaving a profile. Existing login/recovery continues. Verify owner-issued staff invites still complete with registration disabled: the private deferred Auth trigger checks the final `auth.users.invited_at` value at commit. Do not move this check to an immediate insert trigger; Auth creates the row before setting invitation time. Supabase Auth's own global signup restriction may further restrict registration; enabling the business toggle does not override hosted Auth configuration.
10. Verify table pagination with more than 25 records, appointment/customer detail isolation, financial totals and payment exceptions against staging fixtures. No dashboard data is seeded or fabricated in the app.

The registration trigger relies on the managed Auth invitation transaction. Current upstream behavior was inspected in Supabase Auth's `internal/api/invite.go` and `internal/api/mail.go`; deployment verification remains necessary. New accounts created through an administrator's generic create-user API without invitation time are also blocked while registration is disabled. Use the owner invitation workflow for new staff.

## Operational semantics

- Staff approval is mandatory and enforced by a database constraint. No instant-booking switch was added.
- Settings changes publish a new booking policy only if its rules/terms change; existing request snapshots still reference their original policy. Existing cancellation/no-show settings are carried forward.
- Scheduling interval and default buffer are saved defaults for later booking/service UI. Current service buffers remain authoritative. The future guest endpoint must enforce guest_booking_enabled in addition to contact verification/rate limits.
- Reports aggregate in PostgreSQL, avoiding Data API row limits. Lists use 25-row pages. Dashboard previews are bounded (today/pending 25; upcoming 10; activity 12) and link to full paginated lists.
- Collected = verified SUCCEEDED receipts, including deposits and late receipts. Refunds = SUCCEEDED refunds. Net = collected minus refunds. Outstanding = remaining gross price for awaiting-payment/confirmed/checked-in/in-progress/completed/no-show appointments, excluding pending/declined/expired/cancelled records. Refunds do not automatically create customer debt. These are operational cash reports, not accounting recognition of service revenue.
- Every money total is grouped by currency. Aggregate minor-unit sums are returned as decimal strings to preserve precision beyond JavaScript safe integers.
- Today's cards use the business calendar date. Appointment counts use start time; cash collected uses paid_at. Missing business configuration uses UTC for an empty dashboard and prompts setup.

## Still required before production

Hosted Auth/PostgREST/RLS tests, SMTP and MFA recovery procedures, concurrent database verification, backups/restores, monitoring and deployment-specific rate limits. Job delivery/payment expiry scheduling and payment-provider reconciliation remain later phases. The local static visual preview tests do not replace authenticated browser end-to-end tests.

References checked: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Auth invitation transaction](https://github.com/supabase/auth/blob/master/internal/api/invite.go), [Auth invite timestamp](https://github.com/supabase/auth/blob/master/internal/api/mail.go), [Supabase changelog](https://supabase.com/changelog). The current btree_gist NaN notice concerns floating-point indexes; this schema uses UUID/time ranges and weekday/numeric ranges.
