import "server-only";

import { cookies } from "next/headers";
import { requireArea } from "@/lib/auth/access.server";
import type { Principal } from "@/lib/auth/access";

export const workspaceBranchCookie = "workspace-branch";

export type WorkspaceBranchOption = {
  id: string;
  name: string;
  slug: string;
  is_default: boolean;
  is_active: boolean;
};

export type WorkspaceBranchContext = {
  branches: WorkspaceBranchOption[];
  selectedBranchId: string | null;
  selectedBranchName: string | null;
  allLabel: string;
  selectorVisible: boolean;
  unavailable: boolean;
  warning: string | null;
};

export async function resolveWorkspaceBranchContext(area: "admin" | "staff") {
  const access = await requireArea(area);
  const [branchResult, cookieStore] = await Promise.all([
    access.supabase.from("branches").select("id,name,slug,is_default,is_active")
      .order("is_default", { ascending: false }).order("name"),
    cookies(),
  ]);
  if (branchResult.error) throw new Error("Your assigned branch access could not be checked. Refresh and try again.");

  const branches = (branchResult.data ?? []) as WorkspaceBranchOption[];
  const saved = cookieStore.get(workspaceBranchCookie)?.value ?? "";
  const selected = branches.find(branch => branch.id === saved);
  const staleSelection = Boolean(saved && saved !== "all" && !selected);
  const oneBranch = branches.length === 1;
  const selectedBranchId = oneBranch ? branches[0].id : selected?.id ?? null;
  const selectedBranchName = branches.find(branch => branch.id === selectedBranchId)?.name ?? null;
  const principal = access.principal as Principal;
  const allLabel = area === "admin" && principal.roles.includes("OWNER") ? "All branches" : "All assigned branches";

  return {
    ...access,
    branchContext: {
      branches,
      selectedBranchId,
      selectedBranchName,
      allLabel,
      selectorVisible: branches.length > 1,
      unavailable: branches.length === 0,
      warning: staleSelection ? "Your previous branch is no longer available. Showing only branches you can access." : null,
    } satisfies WorkspaceBranchContext,
  };
}
