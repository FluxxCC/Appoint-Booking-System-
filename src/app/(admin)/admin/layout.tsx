import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { readAdmin } from "@/features/admin/data.server";
import { readPublicWebsite } from "@/features/public-site/data.server";
import { resolveWorkspaceBranchContext } from "@/features/branches/workspace-context.server";
import { readHomeServiceCount } from "@/features/home-service/data.server";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function Layout({ children }: { children: React.ReactNode }) {
  const [workspace, { data }, homeServiceCount, site] = await Promise.all([resolveWorkspaceBranchContext("admin"), readAdmin("dashboard"), readHomeServiceCount("admin"), readPublicWebsite()]);
  return <AppShell area="admin" principal={workspace.principal} branchContext={workspace.branchContext} counts={{ "/admin/appointments": data.pending?.length ?? 0, ...(homeServiceCount===null?{}:{ "/admin/home-service": homeServiceCount }) }} businessName={site.business?.name}>{children}</AppShell>;
}
