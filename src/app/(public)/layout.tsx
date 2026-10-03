import { PublicNav, SiteFooter } from "@/components/public-site/site";
import { readPublicWebsite } from "@/features/public-site/data.server";
import { getAccess } from "@/lib/auth/access.server";
export const dynamic = "force-dynamic";
export default async function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [site, access] = await Promise.all([readPublicWebsite(), getAccess().catch(() => ({ principal: null }))]);
  return <div className="min-h-screen bg-canvas pb-[calc(5rem+env(safe-area-inset-bottom))] text-ink md:pb-0"><PublicNav site={site} principal={access.principal}/>{children}<SiteFooter site={site}/></div>;
}
