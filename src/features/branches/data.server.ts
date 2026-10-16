import "server-only";

import { requireOwner } from "@/lib/auth/access.server";
import type { Database } from "@/types/database.generated";

export type Branch = Database["public"]["Tables"]["branches"]["Row"];
export type BranchApprovalSetting = Database["public"]["Tables"]["branch_booking_settings"]["Row"];
export type ManagedBranch = Branch & { approvalSettings?: BranchApprovalSetting };

export async function readOwnerBranches() {
  const { supabase } = await requireOwner();
  const [branchesResult, settingsResult] = await Promise.all([
    supabase.from("branches").select("*").order("is_default", { ascending: false }).order("name"),
    supabase.from("branch_booking_settings").select("*"),
  ]);

  if (branchesResult.error || settingsResult.error) throw new Error("Branches could not be loaded. Refresh the page and try again.");
  const settings = new Map((settingsResult.data ?? []).map(setting => [setting.branch_id, setting as BranchApprovalSetting]));
  return { branches: (branchesResult.data ?? []).map(branch => ({ ...branch, approvalSettings: settings.get(branch.id) })) as ManagedBranch[] };
}
