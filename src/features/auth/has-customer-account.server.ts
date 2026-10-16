import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import type { Principal } from "@/lib/auth/access";

/** Home Service requires an active, verified customer-only account. A linked
 * customer row does not grant Home Service booking to business-role accounts.
 */
export async function hasVerifiedCustomerAccount(
  supabase: SupabaseClient<Database> | null | undefined,
  principal: Principal | null | undefined,
) {
  if (!supabase || !principal?.profileActive || principal.roles.length > 0) return false;
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("id,display_name")
      .eq("auth_user_id", principal.userId)
      .maybeSingle();
    return !error && Boolean(data?.display_name?.trim() && data.display_name.trim().length >= 2);
  } catch {
    return false;
  }
}
