# Connected development project

Created September 30, 2026 through the connected Supabase plugin.

- Project: Appointment Booking System
- Organization: FluxxCC's Org
- Project reference: obpyyjewnsygkxobyunw
- Region: Singapore (ap-southeast-1)
- Creation quote: $0/month; later upgrades/usage changes are not covered by this quote.
- Dashboard: https://supabase.com/dashboard/project/obpyyjewnsygkxobyunw

All nine migrations through Phase 7 are now applied. The connector generated execution-time migration versions that differ from the local filenames. Automatic approval review rejected alignment of the first five remote history entries, so those entries remain unchanged. The four later migrations were applied through the Supabase connector and are recorded below. Do not run CLI migration pushes until the first-five version mismatch is reconciled; a CLI push could replay existing migrations.

| Remote version | Local version | Migration |
| --- | --- | --- |
| 20260930095518 | 20260929123406 | foundation |
| 20260930095526 | 20260929123409 | lifecycle |
| 20260930095532 | 20260929123412 | authorization |
| 20260930095538 | 20260929125716 | auth_application |
| 20260930095545 | 20260930080239 | admin_configuration |
| 20260930114927 | 20260930100505 | catalog_staff_management |
| 20260930114941 | 20260930100849 | catalog_media |
| 20260930114954 | 20260930103459 | availability_engine |
| 20260930115008 | 20260930110411 | public_booking_experience |

The proposed reconciliation updates only these five version/name history entries to the local pairs, retaining their SQL contents. It must verify all five expected old pairs and roll back on any mismatch. This is not schema reapplication.

All public application tables have RLS enabled (verified after the new migrations). The Supabase security advisor reports informational no-policy notices for guest_access_tokens, payment_events and notification_outbox. These backend-only tables intentionally have no browser policies or grants; do not add public access to silence the notices. It also reports leaked-password protection disabled and recommends enabling it in hosted Auth settings. Performance advisories include unused indexes on this newly migrated project and multiple permissive read policies; review again after representative traffic before changing indexes or policy design.

The ignored .env.local contains this project's URL, publishable key, local site URL and project reference. No server secret was retrieved or stored. This is the base system's development project; future business clients still receive separate projects/deployments.

## Temporary preview data

The connected project now contains clearly labeled demo content so the public pages can be previewed: “Demo Barber Studio,” three fictional unlinked barber profiles, three sample services (pay-at-business, deposit, and full-payment configurations), Monday–Saturday hours, one demo announcement, and three fictional guest-customer records using reserved `.test` email addresses. This is fixture data only; no payment records or appointments were fabricated. The public home page and booking form were opened locally and rendered against this project.

There is one verified Auth account in the project, but it currently has no role. No admin or staff login was created, no existing account was promoted, and no invitations were sent. The role-gated admin setup requires an explicit owner identity plus the protected bootstrap/MFA flow; the current tools do not provide a safe Auth Admin user-creation action. Remove the demo rows before configuring this base project for a real business, or retain them only for preview.

## Remaining setup

- Phases 5–7 database migrations are applied. Public catalog, staff, availability and booking RPCs now exist. The migration-history mismatch still blocks a safe CLI push until reconciled. See `catalog-staff-setup.md`, `availability-engine.md` and `public-booking.md` for staging checks.

- Add the project's server-only secret to SUPABASE_SECRET_KEY locally before owner bootstrap or staff invitation actions. Never paste it into chat or use a NEXT_PUBLIC_ variable.
- Complete hosted Auth redirects, confirmation/recovery/invitation templates, password settings, SMTP and TOTP configuration from authentication-setup.md. Local config.toml does not automatically configure a hosted project.
- Enable Supabase Auth leaked-password protection before allowing real customer accounts.
- Create/verify the intended owner account, then use the controlled initial-owner bootstrap procedure and enroll MFA. No user account or privileged role was created automatically.
- Configure actual business details, policies and weekly hours through the admin workspace.
- Run authenticated end-to-end and native multi-session tests. Public connectivity checks do not establish every hosted Auth flow or race behavior.
- CLI interactive login/link remains separate from the application connection; use the project reference above when linking. No database password or management token was collected.

Advisor reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
