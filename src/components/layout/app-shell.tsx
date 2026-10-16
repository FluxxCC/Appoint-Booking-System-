import Link from "next/link";
import Image from "next/image";
import type { Area, Principal } from "@/lib/auth/access";
import { ShellNav } from "./shell-nav";
import { RealtimeRefresh } from "./realtime-refresh";
import { logoutAction } from "@/features/auth/actions";
import { AnnouncementBanner } from "@/components/public-site/announcement-banner";
import type { PublicWebsite } from "@/features/public-site/model";
import { WorkspaceBranchPicker } from "@/features/branches/workspace-picker";
import type { WorkspaceBranchContext } from "@/features/branches/workspace-context.server";

const titles: Record<Area, string> = { admin: "Business workspace", staff: "Staff workspace", account: "Customer account" };

function roleLabel(area: Area, principal: Principal) {
  if (area === "admin") return principal.roles.includes("OWNER") ? "Owner" : "Administrator";
  if (area === "staff") return "Staff";
  return "Customer";
}

export function AppShell({ area, principal, children, announcement, counts, businessName, branchContext }: { area: Area; principal: Principal; children: React.ReactNode; announcement?: PublicWebsite["announcements"][number] | null; counts?: Record<string, number>; businessName?: string | null; branchContext?: WorkspaceBranchContext }) {
  const title = titles[area];
  const role = roleLabel(area, principal);
  const brand = businessName?.trim() || "Usteng Barber Shop";

  return <div className="min-h-screen bg-canvas">
    <a href="#main-content" className="sr-only z-50 rounded-lg bg-surface p-3 focus:not-sr-only focus:fixed">Skip to content</a>
    <header className="workspace-banner sticky top-0 z-30 text-white">
      <div className="mx-auto flex min-h-[76px] max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-7">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <label htmlFor="workspace-sidebar-toggle" title="Open workspace navigation" className="workspace-mobile-menu-toggle grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl border border-white/25 bg-white/10 text-white transition hover:bg-white/20 sm:hidden">
            <span className="sr-only">Toggle workspace navigation</span>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
          </label>
          <Link href="/" aria-label={`${brand} home`} className="relative size-11 shrink-0 overflow-hidden rounded-lg border border-white/20 bg-[#f8f6e8] shadow-sm">
            <Image src="/images/usteng-barber-shop-mark.png" alt="" fill sizes="88px" className="object-cover" />
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

    {area !== "account" && branchContext && (branchContext.selectorVisible || branchContext.unavailable || branchContext.warning) && <div className="mx-auto flex max-w-[1600px] flex-col gap-3 border-b border-line bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-7">
      <div className="min-w-0"><p className="eyebrow">Current branch view</p><p className="mt-1 text-xs text-muted">Operational records and summaries use this scope.</p></div>
      <WorkspaceBranchPicker area={area} context={branchContext}/>
    </div>}

    <div className="workspace-frame mx-auto max-w-[1600px] sm:grid sm:grid-cols-[300px_minmax(0,1fr)]">
      <input id="workspace-sidebar-toggle" type="checkbox" aria-label="Toggle workspace navigation" className="workspace-sidebar-toggle sr-only" />
      <label htmlFor="workspace-sidebar-toggle" aria-label="Close workspace navigation" className="workspace-sidebar-backdrop fixed inset-x-0 bottom-0 top-[76px] z-40 hidden cursor-pointer bg-ink/40 sm:hidden"><span className="sr-only">Close workspace navigation</span></label>
      <aside className="workspace-sidebar fixed bottom-0 left-0 top-[76px] z-50 w-[min(86vw,320px)] overflow-y-auto border-r border-line bg-white shadow-2xl sm:sticky sm:top-[76px] sm:z-20 sm:h-[calc(100dvh-76px)] sm:w-auto sm:shadow-none">
        <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:hidden"><p className="eyebrow">{role} menu</p><label htmlFor="workspace-sidebar-toggle" className="cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:bg-canvas hover:text-ink">Close</label></div>
        <div className="workspace-sidebar-profile hidden border-b border-line px-5 pb-5 pt-6 sm:block">
          <div className="flex items-center gap-3">
            <div className="workspace-profile-copy min-w-0 flex-1"><p className="eyebrow">{role} workspace</p><p className="mt-2 truncate text-sm font-semibold text-ink" title={principal.email}>{principal.email}</p></div>
            <label htmlFor="workspace-sidebar-toggle" title="Toggle sidebar" className="workspace-sidebar-collapse grid size-9 shrink-0 cursor-pointer place-items-center rounded-xl border border-line text-muted transition hover:border-accent/40 hover:bg-accent-soft hover:text-accent-dark">
              <span className="sr-only">Toggle sidebar</span>
              <svg viewBox="0 0 24 24" aria-hidden="true" className="workspace-sidebar-toggle-icon size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m14 6-6 6 6 6"/></svg>
            </label>
          </div>
        </div>
        <ShellNav area={area} principal={principal} counts={counts} />
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
