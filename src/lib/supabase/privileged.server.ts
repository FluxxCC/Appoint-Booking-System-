import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database.generated";

/** Bypasses RLS. Only trusted jobs/webhooks and OWNER-authorized Auth invitations may call this factory.
 * Never use this for routine user operations or accept a caller-provided actor ID.
 */
export function createPrivilegedClient() {
  const url = z.url().parse(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = z.string().min(1).parse(process.env.SUPABASE_SECRET_KEY);
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
