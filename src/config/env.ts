import { z } from "zod";

const publicSchema = z.object({
  url: z.url(),
  publishableKey: z.string().min(1),
});

// Lazy validation permits the static foundation to build without credentials.
// Auth/data operations fail closed when configuration is missing.
export function getSupabasePublicEnv() {
  return publicSchema.parse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
