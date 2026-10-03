"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicEnv } from "@/config/env";
import type { Database } from "@/types/database.generated";

export function createClient() {
  const env = getSupabasePublicEnv();
  return createBrowserClient<Database>(env.url, env.publishableKey, {
    cookieOptions: { secure: process.env.NODE_ENV === "production" },
  });
}
