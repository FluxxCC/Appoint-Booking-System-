import { readOwnerBranches } from "@/features/branches/data.server";
import { BranchManagementPanel } from "@/features/branches/panel";

export const dynamic = "force-dynamic";

export default async function BranchesPage() {
  const { branches } = await readOwnerBranches();
  return <BranchManagementPanel branches={branches}/>;
}
