# Deep Security Audit — Appointment Booking System

**Audit date:** 2026-10-05 (Asia/Manila)  
**Mode:** Read-only. No code, migration, environment, Supabase, provider, DNS, or deployment changes were made.  
**Result:** No confirmed exploitable application-code vulnerability was established in the reviewed snapshot. This is not a certification of security: production HTTP behavior and some provider controls could not be verified from this environment.

## 1. Executive summary

The review covered the current working tree, all 26 local SQL migrations, dependency advisory output, secret patterns in the current tracked tree and reachable Git history, and read-only metadata from the connected Supabase project. The configured demo deployment could not be reached: outbound requests failed at the environment proxy (`127.0.0.1:9`). Therefore live deployment headers, unauthenticated route boundaries, source maps, and runtime response bodies remain unverified.

The connected Supabase database was reachable read-only. Its application tables inspected here have RLS enabled. Backend-only token, payment-event, notification-outbox, and invitation tables deny direct `anon` and `authenticated` table privileges. Sensitive server RPCs were not executable by `anon`; every inspected `SECURITY DEFINER` routine pins `search_path` to the empty string. The live Security Advisor reports Auth leaked-password protection disabled. This is a confirmed LOW configuration weakness. The sole migration drift is the known local appearance migration absent remotely; that migration adds appearance/storage functionality rather than core booking or authorization controls.

### Severity counts

| Severity | Count |
|---|---:|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 0 |
| LOW | 1 |
| INFORMATIONAL | 2 |

## 2. Scope

- Repository: `Appointment Booking System`, branch `main`, HEAD `72e0330a670c1c1622c8d502afcd5c25eeeabc3e`.
- Current worktree: 320 tracked files; 96 changed/untracked status entries at audit time. This includes uncommitted runtime, UI, SQL migration, test, and documentation changes. Those current files were in scope. The 96 count is Git status entries, not a claim of 96 application source files.
- Local database migrations: 26 files under `supabase/migrations`.
- Connected Supabase project: the project named “Appointment Booking System” in the connected account, reported ACTIVE_HEALTHY, Postgres 17.6.1.171. Project identity was matched via the connected project listing. No DB writes were issued.
- Dependency manifests: `package.json` and npm lockfile via `npm audit`.
- Targeted passive deployment target: the configured demo domain documented by this project. Requests did not get through the environment's outbound proxy.

No authenticated production account was supplied. No brute force, fuzzing, destructive action, payment, email send, data creation, or state-changing HTTP request was attempted.

## 3. Methodology

- Read the supplied audit scope and repository `AGENTS.md`; inspected the current Git revision/status before review.
- Traced authentication, role checks, MFA gates, customer/staff/admin data access, booking creation, availability, payment routes and SQL settlement, guest access, Home Service address handling, rate limiting, email dispatch, uploads, redirects, and related SQL policies/grants.
- Reviewed all local migrations and compared version identifiers with the connected project's migration history.
- Issued read-only catalog queries for RLS state, policies, table privileges, function security attributes and execute grants, and storage policies; read the Supabase Security Advisor and project metadata.
- Ran `npm audit` without fix/upgrade flags.
- Searched tracked paths and current/history contents for high-confidence credential patterns. Secret values were not printed or included in this report.
- Attempted finite unauthenticated GET requests to `/`, `/admin`, `/staff`, `/account`, and `/robots.txt` on the configured demo host. Network egress was refused by the local proxy before any target response. A browser-side web open was also inaccessible.

## 4. Source revision / working-tree state

- Branch: `main`.
- HEAD: `72e0330a670c1c1622c8d502afcd5c25eeeabc3e`.
- Tracked files: 320.
- Git status entries: 96 modified, deleted, or untracked entries.
- The working tree already contained significant uncommitted edits at the start of review. All were treated as current source under audit. No pre-existing change was reverted or overwritten.
- The new file `docs/security/deep-security-audit.md` is the only file created by this audit.

## 5. Threat model

The principal threats considered were unauthenticated booking/availability abuse; authenticated customers changing identifiers to cross customer boundaries; staff accessing another staff member's records; privilege escalation through registration, profiles, role mutation, or invitations; abuse of bearer guest links; forged/replayed PayMongo webhook events or browser payment claims; manipulation of price/scheduling/location fields; exposure of private Home Service destinations; and stored or reflected injection through user-controlled text/media.

The review assumes Supabase Auth and provider signing keys are not already compromised, the hosting platform correctly handles its trusted proxy headers, and the deployed application corresponds to the reviewed source unless explicitly marked unverified. These assumptions were not all verified live.

## 6. Attack surface

Reviewed surfaces include public pages/catalog and booking, `/api/availability`, guest access/recovery/inspection/exchange endpoints, payment checkout/verify and PayMongo webhook routes, customer account pages, staff workspace and operations, owner/admin actions and configuration pages, Supabase RPCs/tables/storage, auth callback/recovery/MFA routes, email outbox/templates, external map links, and the configured rate limiter.

## 7. Confirmed findings

### F-01 — Compromised-password protection disabled

- **Severity:** LOW. **Confidence:** High for the connected Supabase project at query time.
- **Affected surface:** Supabase Auth password policy; all password-authenticated roles.
- **Evidence:** The connected Supabase Security Advisor returned `auth_leaked_password_protection` with the setting disabled.
- **Attack prerequisites/scenario:** A user selects a password already present in known breach corpora. A password-stuffing attacker may then have a higher success chance if that user reused the credential elsewhere. This setting does not itself permit account takeover; credential reuse and a matching password are prerequisites.
- **Impact:** Increased risk of customer or workforce account compromise, potentially including privileged accounts subject to the application's MFA gates.
- **Why other controls do not remove the risk:** MFA reduces privileged-account impact but does not protect every customer flow or prevent password reuse. The advisor confirms the breached-password check is off.
- **Recommended remediation:** Enable Supabase Auth leaked-password protection and review password policy. No change was made.

## 8. Severity table

| ID | Finding | Severity | Confidence | Status |
|---|---|---|---|---|
| F-01 | Supabase Auth leaked-password protection disabled | LOW | High | Confirmed live setting |
| D-01 | Appearance migration exists locally but not remotely | INFORMATIONAL | High | Confirmed deployment drift; functionality/configuration impact, no core security dependency identified |
| H-01 | Source header baseline omits CSP, Permissions-Policy, and HSTS | INFORMATIONAL | High for source; deployed response unverified | Hardening gap, not a confirmed exploitable vulnerability |

No confirmed CRITICAL, HIGH, or MEDIUM finding was established. “None established” is limited to the reviewed source, reachable live database metadata, and checks listed here.

## 9. Authentication assessment

**Source reviewed:** auth actions, login/register/recovery/reset/callback/continue routes, Supabase server/browser client construction, access context and area guards, MFA page/actions, and recent role-specific login changes.

Observed controls include server-side Supabase Auth user resolution, server-fetched role/access context rather than trusting client role claims, registration without a role-selection field, role-specific workspace checks after sign-in, and guarded redirects. Privileged area access routes through access decisions; admin/owner areas require AAL2 in the source access logic, with server-side gates in addition to the MFA UI. Public auth continuation constrains destination paths and uses role-appropriate login routes. Cookie/session handling is delegated to the SSR Supabase client and framework response path.

**Assessment:** No bypass was confirmed in source. Live Auth settings beyond the Security Advisor result, actual MFA enrollment/enforcement in the deployed project, email-confirmation settings, password recovery delivery, and deployed cookie attributes were not directly verified.

## 10. Authorization/RBAC assessment

Role resolution and access context are derived server-side. Registration and customer profile flows do not accept an OWNER/ADMIN/STAFF role from public input. Admin/owner management operations use server actions and database routines with role checks; staff linking and enable/disable behavior is backed by constrained routines. Public login does not create privileged membership. Live role/profile policies are self/admin-scoped; direct role insert/update privileges were absent for the authenticated role in the inspected table grants.

**Assessment:** No CUSTOMER→STAFF/ADMIN/OWNER or STAFF→ADMIN/OWNER path was confirmed. Owner bootstrap and cross-role mutation routines are sensitive and were checked in source/live execute grants. This does not include adversarial testing with real user accounts or compromised service credentials.

## 11. RLS/database assessment

Live catalog inspection found RLS enabled on inspected application tables, including appointments, customers, profiles, roles, payments, and `appointment_home_locations`. All inspected `SECURITY DEFINER` routines used `search_path=""`. Sensitive booking, payment, notification, guest issue/exchange, and privileged write RPCs were not executable by `anon`; server-only wrappers were service-role-only. The guest lookup routine is callable by `anon`/`authenticated` but is scoped by appointment plus a high-entropy bearer token hash; possession of a valid guest credential is the explicit access model.

Read policies live were consistent with intended owners/admin/assigned staff access. Home locations were selectable only by authenticated users and only for an owning customer, admin, or authorized manager under lifecycle policy. The customer-own path includes pending appointments; staff management access excludes pending/declined/cancelled lifecycle states. Backend-only tables (guest tokens, notification outbox/receipts, payment events, admin invitations) had no direct anon/authenticated table privileges. Supabase Advisor's no-policy notices for those tables align with this backend-only grant model; RLS being enabled without a policy is not itself a public exposure.

The public catalog storage bucket is publicly readable and constrained to WebP with a 2 MiB size limit; live object writes/deletes are admin-scoped and path constrained. Public visibility is expected for catalog media. No public view objects were returned in the inspected schema. PostgreSQL superuser/service-role behavior is intentionally privileged and is outside RLS enforcement; application controls around service-role calls are discussed below.

## 12. Home Service privacy assessment

The application reads a verified auth user before Home Service submission, validates the address/coordinate/area payload, and sends identity separately to a server-only privileged RPC. The SQL creation path checks the authenticated customer identity and Home Service eligibility, derives service price/fee/schedule server-side, records an immutable fulfillment/fee snapshot, and writes the destination separately from public catalog data. Guest Home Service is rejected by the server-side flow; hiding the option in the UI is not the only control.

Live `appointment_home_locations` has RLS enabled, no anon privilege, no direct insert/update/delete grants to authenticated users, and a narrow authenticated select policy. Destination values are only serialized into authorized staff/admin/customer workspace paths according to lifecycle/access checks in source. The email outbox/template path reviewed sends a Home Service label, not the exact street destination. Map destinations are encoded into outbound map URLs only from the authorized workspace view.

**Residual verification limits:** No logged-in cross-customer/staff runtime test was possible; edge logs, analytics, production HTML, and deployed network payloads were not inspected. General-area disclosure and operational access by administrators are business policy choices; exact location confidentiality is the principal verified property.

## 13. Guest-access assessment

Source traces token generation, SHA-256 digest storage, email delivery, non-consuming link inspection, intentional POST exchange, and scoped HttpOnly guest authorization. The bearer credential is generated server-side with cryptographic randomness, raw values are intended for delivery rather than DB storage, and the exchange endpoint is rate-limited and consumes the token atomically before issuing access. The resulting cookie is scoped and marked HttpOnly/SameSite and Secure in production configuration. Guest data access uses appointment/token scope and a recovery path rather than exposing another booking by identifier alone.

Live grants confirm the lookup function is exposed to anon/authenticated, but it requires the matching appointment identifier and unguessable token digest. This is intentional capability access: a stolen valid guest link remains usable until expiry/revocation. Link scanner behavior and race protections are implemented in source/database flow; no live race/replay test was performed. PENDING guest permissions remain tied to the guest's own appointment rather than general staff/customer authority.

## 14. Booking/availability assessment

Public availability returns schedule slots and public service/staff identifiers, not customer or home-address data. Requests are rate-limited. Booking actions validate schemas, derive service/price/duration/payment snapshots from database data, constrain date/time and staff/service eligibility, and use server-side booking procedures. The Home Service mode, travel windows, and fees are separately derived/validated. SQL uses schedule locking/validation, overlap checks and exclusion constraints, plus transactional transitions to prevent competing accepted appointments and buffer bypass.

Client-supplied price, total, fee, deposit, payment mode, duration, accepted state, or payment deadline is not treated as authoritative in the reviewed creation/acquisition flow. PENDING reservations do not acquire an accepted-payment window until approval/acquisition. Payment-expiration routines release/expire eligible records and prevent expired states from being reacquired through the normal transition path.

**Abuse risk:** Anonymous/business-location booking can still be used for ordinary request spam/slot pressure. Rate limits and approval/payment lifecycle constrain impact, but no live volume, contention, or account-abuse exercise was run.

## 15. Payment/PayMongo assessment

Source flow reviewed: server-side checkout creation, safe provider URL validation, authenticated or guest-scoped caller checks, appointment/payment linkage, browser return verification, PayMongo raw-body signature handling, event type/object validation, amount/currency/reference association, and idempotent database settlement. Browser redirects/status query parameters are not accepted as payment proof. Privileged payment RPCs are server/service-role-only and database settlement validates the internal payment/appointment state. Duplicate events are recorded/idempotently handled. Payment expiry and late/stale checkout handling avoid treating a browser success as authority to reclaim a released slot.

**Live limits:** No PayMongo account/dashboard, webhook configuration, secret rotation, production-vs-test mode, delivery history, or live checkout was inspected. No payment was initiated. Provider-side webhook correctness is therefore source-verified only, not live verified.

## 16. Upload assessment

Live `catalog-images` bucket is public-read, `image/webp` only, max size 2 MiB. Live object insertion is authenticated admin-only and object names must match UUID-based `services|staff/...webp`; deletion additionally requires the image to be unreferenced. This limits arbitrary path overwrite and executable/SVG hosting risk. Application source validates allowed image type/size and produces WebP before upload.

The absent appearance migration means the remote database does not have its appearance upload policy from that migration; this appears to impair the new appearance feature rather than weaken existing authorization. No malicious file was uploaded or decoded during this read-only audit. Image decoder/library vulnerabilities are covered by npm audit only, not bespoke fuzzing.

## 17. Injection/XSS/SSRF assessment

SQL operations reviewed use Supabase query builders or fixed SQL routines; no client-supplied SQL fragments or dynamic command execution were found in the traced paths. React rendering uses normal escaped text; email templates escape interpolation. No use of `dangerouslySetInnerHTML` was found in the targeted source search. User-controlled map text is URL encoded into known Google Maps/OpenStreetMap destinations; it is not used as a server-side fetch target. Server-side network calls reviewed target fixed Supabase/PayMongo/Resend/Upstash endpoints, with no confirmed user-controlled SSRF path.

This was not a full static taint-analysis run, browser DOM instrumentation, or adversarial HTML payload campaign. Any rich text or future HTML rendering change warrants renewed XSS review.

## 18. CSRF/CORS assessment

Privileged state changes use server actions with framework same-origin protections and server-side role/AAL checks, or API routes that validate caller/session and relevant Origin/mode rules. Payment checkout/verification require scoped authorization. Guest exchange is an intentional POST with bearer access and cookie issuance; link inspection does not consume or mutate the credential. No permissive `Access-Control-Allow-Origin: *` handling for sensitive authenticated APIs was found in reviewed source.

**Not verified:** Actual deployed CORS/Origin behavior and browser cookie attributes were not observed because the deployment could not be reached. No forged cross-origin browser request was issued.

## 19. Rate-limit/abuse assessment

The shared rate-limit module defines policies for availability, booking, recovery, checkout, guest access, and payment verification; it uses a distributed Upstash path when configured with bounded local fallback behavior. Keys are derived from a trusted client identifier and hashed before storage. Source explicitly trusts `x-real-ip` as supplied by the hosting proxy.

**Residual risk:** Correctness depends on the hosting edge stripping/replacing client-supplied forwarding headers. The configured deployment was unreachable, so proxy behavior and Upstash live availability/configuration were not verified. If the edge forwards a caller-controlled `x-real-ip`, rate limits may be bypassable. Validate this at the deployed edge before relying on per-IP abuse limits.

## 20. Dependency audit

`npm audit --json` completed against the current lockfile on 2026-10-05. Result: **0 vulnerabilities** (0 informational, 0 low, 0 moderate, 0 high, 0 critical). npm reported 521 total packages in the audit tree: 35 production, 452 development, 120 optional, 34 peer (categories may overlap). No advisory package/version/reachability pair was returned. This reflects the registry advisory data available at audit time and does not establish that dependencies are defect-free.

## 21. Secret-leak audit

High-confidence patterns for Supabase service/secret keys, PayMongo secret keys, Resend keys, private key blocks, and literal service-role assignments were searched in current tracked content and reachable Git history. No matching credential was found in either scope. Tracked secret-like paths found: `.env.example` only; it is an example template, not a secret file. No secret values were printed.

A local ignored `.env.local` exists, as expected for development; its contents were not displayed or reported. It is not tracked. Pattern scanning cannot detect arbitrary formats, low-entropy credentials, encoded secrets, or credentials in unavailable/unreachable Git objects. No rotation is indicated by this scan alone.

## 22. Security-header assessment

Source `next.config.ts` sets `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `X-Frame-Options: DENY`; sensitive booking/access/confirmation routes also set private/no-store, no-referrer, and noindex. `poweredByHeader` is disabled. Source does not set Content-Security-Policy, Permissions-Policy, or HSTS. HSTS may be added by hosting infrastructure, but this could not be checked. Deployed headers remain unverified.

**H-01 (INFORMATIONAL):** Add and test a nonce/hash-based CSP appropriate for the app, a restrictive Permissions-Policy, and confirm HSTS at the TLS edge. This is hardening advice; no exploit was confirmed from the source gap alone.

## 23. Deployment-drift assessment

Local migrations: 26. Remote migrations: 25. The only local-only version is `20261005094639_admin_website_appearance.sql`. All other versions, including booking lifecycle, payments, guest access, notification outbox, rate-limit boundary, customer directory, and Home Service migrations, appeared in the live migration history.

The missing appearance migration adds business appearance/branding configuration and associated media policy. No reviewed authorization, payment, booking, RLS, or Home Service privacy protection depends on it. It may leave appearance save/upload behavior incomplete in the connected deployment.

**D-01 (INFORMATIONAL):** Deployment is one migration behind local appearance work. Confirm intended release sequencing and schema compatibility before deploying that feature. No migration was applied.

## 24. Live-state verification results

**Verified live through connected Supabase read-only tooling:** project healthy metadata and PostgreSQL version; migration history; RLS enabled across inspected application tables; specific policies and grants for appointments, profiles, roles, customers, payments/refunds, staff, business settings, home locations, storage objects; no direct privileges on backend-only sensitive tables; inspected SECURITY DEFINER search paths and execute privileges; public catalog bucket MIME/size/public state; Security Advisor findings, including leaked-password protection disabled.

**Not verified live:** production web server/headers/routes/source maps/robots or unauthenticated responses; production Auth MFA/email/password configuration beyond the leaked-password advisor; live PayMongo configuration/secrets/webhook delivery; Upstash endpoint/proxy trust behavior; production Resend settings; browser session cookie flags; live account-to-account IDOR tests. Network access to the demo host failed before an HTTP response was received.

## 25. Positive verified controls

- Live RLS enabled on the inspected application tables.
- Backend-only event, notification, token, invitation tables deny direct anon/authenticated table privileges.
- Home location table has no anon privilege and narrow authenticated read policy; writes are server RPC-mediated.
- Inspected `SECURITY DEFINER` routines pin an empty search path; sensitive server-side RPCs deny anon execution.
- Privileged role and MFA decisions are performed in server/database paths, not UI alone.
- Current booking source derives pricing and schedule authority server-side and uses transactional conflict validation.
- PayMongo browser return is not treated as payment proof in reviewed source; webhook signature and idempotent settlement paths exist.
- Guest credentials are hash-stored, scoped, expiring bearer access with explicit exchange; the live RPC's public execution is token-gated.
- Catalog media is public WebP only with a size limit and admin/path constrained writes.
- npm audit returned no known dependency advisories at scan time; secret scans found no high-confidence tracked/history match.

## 26. Unverified assumptions

- The configured public demo corresponds to the connected Supabase project and exact reviewed HEAD/worktree.
- The hosting proxy overwrites client-supplied `x-real-ip` before app requests reach rate limiting.
- Production CSP/HSTS/other headers and session cookies match application source plus platform defaults.
- Supabase Auth MFA settings and all live policy/role data are configured as expected beyond visible SQL/Auth Advisor evidence.
- PayMongo/Resend/Upstash provider settings and secrets are correct, active, and isolated by environment.
- Email scanners and browsers exercise the guest flow exactly as intended in production.

## 27. Recommended remediation priority

1. Enable Supabase Auth leaked-password protection (F-01, LOW).
2. Verify the deployment proxy overwrites client forwarding headers before relying on IP-based limits.
3. Validate deployed CSP, Permissions-Policy, HSTS, and cookie headers; add missing hardening where compatible.
4. Resolve the appearance migration drift through normal release review; do not apply it blindly to the connected project.
5. Perform authenticated production tests with designated test identities for cross-customer, cross-staff, pending Home Service, MFA, guest replay, and payment-state boundaries before production sign-off.

No remediation was performed.

## 28. Remaining testing gaps

- No live public HTTP responses were obtained; safe passive endpoint assessment is incomplete.
- No authenticated staging/production test identities were provided for role/IDOR/MFA checks.
- No active test was performed against live rate limits, webhook signature handling, payment expiry races, guest replay, booking contention, upload decoding, or email abuse; destructive/provider-side operations were intentionally excluded.
- No live provider dashboard/configuration inspection for PayMongo, Resend, or Upstash.
- No secret scanner with broad entropy/format coverage was available; high-confidence regex and Git-history scans were used.
- No complete dynamic scan, SAST taint engine, DAST, external penetration test, or source-map enumeration was run.

## 29. Production-readiness security verdict

**Verdict: NOT CLEARED FOR PRODUCTION SIGN-OFF FROM THIS AUDIT ALONE.** The reviewed application source and live database show several strong controls and no confirmed exploitable source vulnerability in scope, but one confirmed LOW Auth hardening issue remains, and public deployment behavior plus provider/proxy configuration were not verified. Treat this as a substantially expanded but still PARTIAL security assessment. Review and address F-01, verify deployment assumptions, and complete controlled authenticated staging tests before relying on this report as a release gate.
