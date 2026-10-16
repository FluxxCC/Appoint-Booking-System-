import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { readStaffWorkspace } from "@/features/catalog/data.server";
import { readPublicWebsite } from "@/features/public-site/data.server";
import { resolveWorkspaceBranchContext } from "@/features/branches/workspace-context.server";
import { readHomeServiceCount } from "@/features/home-service/data.server";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function Layout({ children }: { children: React.ReactNode }) {
  const [access, workspace, homeServiceCount, site] = await Promise.all([resolveWorkspaceBranchContext("staff"), readStaffWorkspace(), readHomeServiceCount("staff"), readPublicWebsite()]);
  return <AppShell area="staff" principal={access.principal} branchContext={access.branchContext} counts={{ "/staff/appointments": workspace.pending.length, ...(homeServiceCount===null?{}:{ "/staff/home-service": homeServiceCount }) }} businessName={site.business?.name}>{children}</AppShell>;
}
