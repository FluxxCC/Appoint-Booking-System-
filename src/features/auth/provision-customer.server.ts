import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import { customerProfileSchema } from "./schemas";

export async function provisionVerifiedCustomer(supabase: SupabaseClient<Database>) {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email_confirmed_at) return false;
  const { data: existing, error: lookupError } = await supabase.from("customers").select("id,display_name").eq("auth_user_id", data.user.id).maybeSingle();
  if (lookupError) return false;
  if (existing?.display_name?.trim().length && existing.display_name.trim().length >= 2) return true;
  // Metadata supplies display/contact input only; never roles, IDs or ownership.
  const parsed = customerProfileSchema.safeParse({ fullName: data.user.user_metadata.full_name, phone: data.user.user_metadata.phone ?? "" });
  if (!parsed.success) return false;
  const { error: provisionError } = await supabase.rpc("complete_customer_profile", { p_name: parsed.data.fullName, p_phone: parsed.data.phone || undefined });
  return !provisionError;
}
