import Link from "next/link";
import Image from "next/image";
import type { Area, Principal } from "@/lib/auth/access";
import { ShellNav } from "./shell-nav";
import { RealtimeRefresh } from "./realtime-refresh";
import { logoutAction } from "@/features/auth/actions";
import { AnnouncementBanner } from "@/components/public-site/announcement-banner";
import type { PublicWebsite } from "@/features/public-site/model";
import { imageUrl } from "@/features/public-site/data.server";

const titles: Record<Area, string> = { admin: "Business workspace", staff: "Staff workspace", account: "Customer account" };

function roleLabel(area: Area, principal: Principal) {
  if (area === "admin") return principal.roles.includes("OWNER") ? "Owner" : "Administrator";
  if (area === "staff") return "Staff";
  return "Customer";
}

export function AppShell({ area, principal, children, announcement, badges, businessName, logoPath }: { area: Area; principal: Principal; children: React.ReactNode; announcement?: PublicWebsite["announcements"][number] | null; badges?: Record<string, string[]>; businessName?: string | null; logoPath?: string | null }) {
  const title = titles[area];
  const role = roleLabel(area, principal);
  const brand = businessName?.trim() || "Appointment Studio";
  const logo = imageUrl(logoPath);

  return <div className="min-h-screen bg-canvas">
    <a href="#main-content" className="sr-only z-50 rounded-lg bg-surface p-3 focus:not-sr-only focus:fixed">Skip to content</a>
    <header className="workspace-banner sticky top-0 z-30 text-white">
      <div className="mx-auto flex min-h-[76px] max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-7">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Link href="/" aria-label={`${brand} home`} className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/20 bg-white/15 text-white shadow-sm">
            {logo ? <Image src={logo} alt="" width={40} height={40} unoptimized className="size-full object-contain" /> : <span aria-hidden="true" className="display-type text-2xl font-bold">{brand.charAt(0).toUpperCase()}</span>}
          </Link>
          <div className="min-w-0"><p className="truncate text-sm font-bold tracking-tight text-white">{brand}</p><p className="mt-0.5 truncate text-xs text-white/75">{title}</p></div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <RealtimeRefresh scope="application" />
          <span className="hidden rounded-full border border-white/20 bg-white/15 px-3 py-1.5 text-xs font-semibold text-white md:inline-flex">{role}</span>
          <form action={logoutAction}><button className="inline-flex min-h-10 items-center rounded-xl border border-white/25 bg-white/15 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/25 sm:px-4 sm:text-sm">Sign out</button></form>
        </div>
      </div>
    </header>

    {area === "account" && <AnnouncementBanner announcement={announcement??null} area="account"/>}

    <div className="workspace-frame mx-auto max-w-[1600px] sm:grid sm:grid-cols-[300px_minmax(0,1fr)]">
      <input id="workspace-sidebar-toggle" type="checkbox" className="workspace-sidebar-toggle sr-only" />
      <aside className="workspace-sidebar sticky top-[76px] z-20 border-b border-line bg-white sm:h-[calc(100dvh-76px)] sm:overflow-y-auto sm:border-b-0 sm:border-r">
        <div className="workspace-sidebar-profile hidden border-b border-line px-5 pb-5 pt-6 sm:block">
          <div className="flex items-center gap-3">
            <div className="workspace-profile-copy min-w-0 flex-1"><p className="eyebrow">{role} workspace</p><p className="mt-2 truncate text-sm font-semibold text-ink" title={principal.email}>{principal.email}</p></div>
            <label htmlFor="workspace-sidebar-toggle" title="Toggle sidebar" className="workspace-sidebar-collapse grid size-9 shrink-0 cursor-pointer place-items-center rounded-xl border border-line text-muted transition hover:border-accent/40 hover:bg-accent-soft hover:text-accent-dark">
              <span className="sr-only">Toggle sidebar</span>
              <svg viewBox="0 0 24 24" aria-hidden="true" className="workspace-sidebar-toggle-icon size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m14 6-6 6 6 6"/></svg>
            </label>
          </div>
        </div>
        <ShellNav area={area} principal={principal} badges={badges} />
        <nav aria-label="Switch workspace" className="workspace-switcher hidden border-t border-line px-5 py-5 text-xs font-semibold sm:flex sm:flex-col sm:gap-3">
          <p className="workspace-switcher-title eyebrow mb-1">Other spaces</p>
          {area !== "account" && <Link href="/account" title="Customer account" className="workspace-switcher-link text-muted hover:text-accent-dark">Customer account</Link>}
          {area !== "admin" && principal.roles.some(item => item === "OWNER" || item === "ADMIN") && <Link href="/admin" title="Business workspace" className="workspace-switcher-link text-muted hover:text-accent-dark">Business workspace</Link>}
          {area !== "staff" && principal.roles.includes("STAFF") && principal.staffActive && <Link href="/staff" title="Staff workspace" className="workspace-switcher-link text-muted hover:text-accent-dark">Staff workspace</Link>}
        </nav>
      </aside>
      <main id="main-content" className="min-w-0 px-4 py-7 pb-10 sm:px-10 sm:py-10 xl:px-12">{children}</main>
    </div>
  </div>;
}
