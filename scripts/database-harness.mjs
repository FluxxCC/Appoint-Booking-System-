import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readdir, readFile } from "node:fs/promises";

export async function createDatabase() {
  const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
  // Test-only Supabase identity shim; production uses the real managed auth schema.
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz default now(), invited_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
    $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb;
    $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on all functions in schema auth to anon, authenticated, service_role;
    -- Minimal Storage metadata shim for SQL policy tests; no Storage HTTP service.
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated,service_role;
    grant select,insert,update,delete on storage.objects to authenticated;
    grant all on all tables in schema storage to service_role;
  `);
  for (const file of (await readdir('supabase/migrations')).filter(x => x.endsWith('.sql')).sort()) {
    try { await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8')); }
    catch (error) { console.error(`Migration failed: ${file}: ${error.message}`); throw error; }
  }
  return db;
}
