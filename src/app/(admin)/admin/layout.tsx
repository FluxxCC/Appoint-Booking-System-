import type { Metadata } from "next";
import { requireArea } from "@/lib/auth/access.server";
import { AppShell } from "@/components/layout/app-shell";
import { readAdmin } from "@/features/admin/data.server";
import { readPublicWebsite } from "@/features/public-site/data.server";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function Layout({ children }: { children: React.ReactNode }) {
  const [{ principal }, { data }, site] = await Promise.all([requireArea("admin"), readAdmin("dashboard"), readPublicWebsite()]);
  return <AppShell area="admin" principal={principal} badges={{ "/admin/appointments": (data.pending ?? []).map(appointment => appointment.id) }} businessName={site.business?.name} logoPath={site.website?.logo_path}>{children}</AppShell>;
}
