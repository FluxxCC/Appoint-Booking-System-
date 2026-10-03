import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function readVerifiedUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const user = !error && data.user?.email_confirmed_at && !data.user.is_anonymous ? data.user : null;
  return { user, supabase };
}

export async function requireUser() {
  const { user, supabase } = await readVerifiedUser();
  if (!user) throw new Error("Authentication required");
  return { user, supabase };
}
