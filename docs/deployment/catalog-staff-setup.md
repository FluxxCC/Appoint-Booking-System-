# Phase 5 deployment and Storage

Phase 5 is locally implemented and tested. The connected development project still has the five Phase 2–4 migrations only. The two new migrations have NOT been applied remotely:

- `20260930100505_catalog_staff_management.sql`
- `20260930100849_catalog_media.sql`

The Phase 5 migrations are applied to the connected project. The earlier migration-history mismatch remains; see `connected-project.md` and do not run a blind CLI push or replay the existing migrations. Configure the catalog and staff records before public pages can show bookable offerings.

After history reconciliation, apply the two migrations in order to staging, inspect migration history, regenerate types from the staging project for comparison, and run Supabase security/performance advisors. Keep the `private` schema out of exposed Data API schemas. Do not add anonymous grants to private contacts.

## Storage configuration

The media migration creates `catalog-images`, a PUBLIC marketing-assets bucket, with a 2 MiB object limit and only `image/webp` as an allowed MIME type. The application accepts still JPEG/PNG/WebP up to 2 MiB and 16 million pixels, decodes and rotates with Sharp, resizes inside 1280×1280, strips metadata and encodes WebP before upload. The file name supplied by the browser is never used.

Paths: `services/<record UUID>/<random UUID>.webp` and `staff/<record UUID>/<random UUID>.webp`. Uploads use the current user's cookie-authenticated Supabase client. No privileged key is used for Storage. Policies require an active OWNER/ADMIN at AAL2 for object listing/insertion/deletion. There is no UPDATE policy and no upsert.

Images are public even when a service or staff profile is unpublished. Do not upload identity documents or private information. Public URLs intentionally require no session. Never repurpose this bucket for sensitive files.

Replacement uploads a new object, then atomically compares the current image pointer with the previously read value. A concurrent replacement fails safely; the losing upload is removed where possible. A successful replacement cleans up the old object. The delete policy refuses to delete a currently referenced image. Removal clears the pointer before deleting the object. Catalog mutations and cleanup share the existing schedule lock. Failed network cleanup may leave an unreferenced object; inspect and remove such objects through the Storage API after verifying neither table references them. Do not delete Storage metadata directly. A scheduled orphan cleanup job is not implemented.

## Hosted verification still required

1. Complete Auth site/redirect URLs, SMTP/templates, TOTP and owner bootstrap as described in `authentication-setup.md`. Only owner invitations/bootstrap require the missing server-only secret. Never put that secret in a public environment variable.
2. Sign in as an AAL2 owner/admin. Create a category, service and staff profile, assign services, save split shifts and add a nonconflicting exception.
3. Upload/replace/remove service and staff images through the actual Storage HTTP service. Verify WebP content, bucket MIME/size limits, public delivery and denied staff/customer/anonymous writes. Test loss of the MFA session and concurrent replacements with two sessions.
4. Link an existing unlinked staff profile using its exact slug and a verified Auth UUID. Check that admin/staff/customer cannot grant roles. Invitations send real email; use intended staging identities.
5. Verify staff isolation and safe public catalog fields using distinct authenticated sessions. Check that revoked roles and disabled accounts lose management access.
6. Exercise concurrent booking acceptance/payment expiry in native PostgreSQL sessions. Retain the GiST reservation exclusion constraint, transaction locks, payment verification and approval-before-payment rules.

Local tests use PostgreSQL via PGlite with minimal Auth and Storage metadata shims. They validate SQL constraints/RLS/functions, not hosted email, JWT issuance, Storage HTTP processing, or native multi-session races. This is not production certification.
