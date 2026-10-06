import type { Metadata } from "next";
import { requireArea } from "@/lib/auth/access.server";
import { AppShell } from "@/components/layout/app-shell";
import { readStaffWorkspace } from "@/features/catalog/data.server";
import { readPublicWebsite } from "@/features/public-site/data.server";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function Layout({ children }: { children: React.ReactNode }) {
  const [{ principal }, workspace, site] = await Promise.all([requireArea("staff"), readStaffWorkspace(), readPublicWebsite()]);
  return <AppShell area="staff" principal={principal} badges={{ "/staff/appointments": workspace.pending.map(appointment => appointment.id) }} businessName={site.business?.name} logoPath={site.website?.logo_path}>{children}</AppShell>;
}
