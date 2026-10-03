import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const args = process.argv.slice(2);
const userId = args[args.indexOf('--user-id') + 1];
const email = args[args.indexOf('--email') + 1];
if (!args.includes('--user-id') || !args.includes('--email')) {
  console.error('Usage: node --env-file=.env.local scripts/bootstrap-owner.mjs --user-id VERIFIED_AUTH_UUID --email VERIFIED_EMAIL');
  process.exit(1);
}
const settings = z.object({ url: z.url(), key: z.string().min(1), userId: z.uuid(), email: z.email() }).safeParse({
  url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY, userId, email,
});
if (!settings.success) {
  console.error('Configure Supabase URL/secret in .env.local and provide a valid, verified account UUID and email.');
  process.exit(1);
}
const client = createClient(settings.data.url, settings.data.key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
try {
  const { error } = await client.rpc('bootstrap_initial_owner', { p_user: settings.data.userId, p_email: settings.data.email });
  if (error) {
    console.error('Bootstrap refused. Confirm the migration is applied, the account/email are verified and active, and no OWNER already exists.');
    process.exitCode = 1;
  } else {
    console.log('Initial OWNER assigned. Sign in and complete authenticator enrollment at /auth/mfa.');
  }
} catch {
  console.error('Unable to contact Supabase. No successful owner assignment was confirmed.');
  process.exitCode = 1;
}
