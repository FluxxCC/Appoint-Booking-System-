import { SiteFooter } from "@/components/public-site/site";
import { PublicNav } from "@/components/public-site/public-nav";
import { AnnouncementBanner } from "@/components/public-site/announcement-banner";
import { readPublicWebsite } from "@/features/public-site/data.server";
import { getAccess } from "@/lib/auth/access.server";
import { RealtimeRefresh } from "@/components/layout/realtime-refresh";
export const dynamic = "force-dynamic";

export default async function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [site, access] = await Promise.all([readPublicWebsite(), getAccess().catch(() => ({ principal: null }))]);
  const name = site.business?.name?.trim() || "Usteng Barber Shop";
  return <div className="min-h-screen bg-canvas text-ink"><RealtimeRefresh scope="public"/><PublicNav name={name} principal={access.principal}/><AnnouncementBanner announcement={site.announcements[0]??null}/><div className="min-w-0">{children}<SiteFooter site={site}/></div></div>;
}
