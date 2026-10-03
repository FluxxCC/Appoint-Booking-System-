import type { Metadata } from "next";
import { requireArea } from "@/lib/auth/access.server";
import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function Layout({ children }: { children: React.ReactNode }) {
  const { principal } = await requireArea("admin");
  return <AppShell area="admin" principal={principal}>{children}</AppShell>;
}
