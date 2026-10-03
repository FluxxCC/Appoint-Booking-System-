import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicEnv } from "@/config/env";
import type { Database } from "@/types/database.generated";

export async function createClient() {
  const env = getSupabasePublicEnv();
  const cookieStore = await cookies();
  return createServerClient<Database>(env.url, env.publishableKey, {
    cookieOptions: { secure: process.env.NODE_ENV === "production" },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies; Proxy handles refresh.
        }
      },
    },
  });
}
