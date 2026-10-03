# Appointment Business System

A modular Next.js application deployed independently for each business. Phases 1–7 include authentication, admin configuration, service/staff management, scheduling, availability, the public business website, customer appointment requests and guest booking access. Payment integration, notifications and the full appearance editor remain future phases.

Booking requires staff acceptance before any deposit or full payment. Pending requests do not reserve time. Acceptance atomically acquires an exclusive staff interval including buffers; payment deadlines release reservations through explicit expiration.

## Start

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Configure credentials before using authentication. Public auth pages and the production build work without credentials; protected operations fail closed until Supabase is configured.

## Verify

```powershell
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
```

## Documentation

- [Architecture and lifecycle](docs/architecture/system-architecture.md)
- [Supabase deployment and environment setup](docs/deployment/supabase-setup.md)
- [Authentication, email templates, MFA and first OWNER setup](docs/deployment/authentication-setup.md)
- [Phase 3 implementation report](docs/operations/phase-3-report.md)
- [Phase 4 implementation and validation report](docs/operations/phase-4-report.md)
- [Phase 4 deployment checks](docs/deployment/admin-configuration.md)
- Phase 5 implementation and validation: `docs/operations/phase-5-report.md`
- Phase 5 Storage and deployment checks: `docs/deployment/catalog-staff-setup.md`
- Phase 6 availability implementation and validation: `docs/operations/phase-6-report.md`
- Phase 6 staging checks: `docs/deployment/availability-engine.md`
- Phase 7 public booking implementation and validation: `docs/operations/phase-7-report.md`
- Phase 7 public deployment checks: `docs/deployment/public-booking.md`
- [Verification scope and remaining work](docs/operations/verification.md)

Schema changes live in `supabase/migrations`. All 25 requested tables have RLS. SQL tests run in embedded PostgreSQL without cloud credentials. Managed Supabase and concurrent native-session verification are still required before launch.
