import Link from "next/link";
import type { Area, Principal } from "@/lib/auth/access";
import { ShellNav } from "./shell-nav";
import { RealtimeRefresh } from "./realtime-refresh";
import { logoutAction } from "@/features/auth/actions";

const titles: Record<Area, string> = { admin: "Business workspace", staff: "Staff workspace", account: "Customer account" };

function roleLabel(area: Area, principal: Principal) {
  if (area === "admin") return principal.roles.includes("OWNER") ? "Owner" : "Administrator";
  if (area === "staff") return "Staff";
  return "Customer";
}

export function AppShell({ area, principal, children }: { area: Area; principal: Principal; children: React.ReactNode }) {
  const title = titles[area];
  const role = roleLabel(area, principal);

  return <div className="min-h-screen bg-canvas">
    <a href="#main-content" className="sr-only z-50 rounded-lg bg-surface p-3 focus:not-sr-only focus:fixed">Skip to content</a>
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex min-h-[76px] max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-7">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Link href="/" aria-label="Appointment studio home" className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-dark">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h3M8 17h6"/></svg>
          </Link>
          <div className="min-w-0"><p className="truncate text-sm font-bold tracking-tight text-ink">Appointment Studio</p><p className="mt-0.5 truncate text-xs text-muted">{title}</p></div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <RealtimeRefresh scope="application" indicator compact />
          <span className="hidden rounded-full bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent-dark md:inline-flex">{role}</span>
          <span className="hidden max-w-56 truncate text-sm text-muted xl:block">{principal.email}</span>
          <form action={logoutAction}><button className="button-secondary min-h-10 px-3 py-2 text-xs sm:px-4 sm:text-sm">Sign out</button></form>
        </div>
      </div>
    </header>

    <div className="mx-auto max-w-[1600px] lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <aside className="border-b border-line bg-white lg:sticky lg:top-[76px] lg:h-[calc(100dvh-76px)] lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="hidden px-5 pb-2 pt-6 lg:block"><p className="eyebrow">{role} area</p><p className="mt-1 text-sm text-muted">Move through your workspace</p></div>
        <ShellNav area={area} principal={principal} />
        <nav aria-label="Switch workspace" className="hidden border-t border-line px-5 py-5 text-xs font-semibold lg:flex lg:flex-col lg:gap-3">
          <p className="eyebrow mb-1">Other spaces</p>
          {area !== "account" && <Link href="/account" className="text-muted hover:text-accent-dark">Customer account</Link>}
          {area !== "admin" && principal.roles.some(item => item === "OWNER" || item === "ADMIN") && <Link href="/admin" className="text-muted hover:text-accent-dark">Business workspace</Link>}
          {area !== "staff" && principal.roles.includes("STAFF") && principal.staffActive && <Link href="/staff" className="text-muted hover:text-accent-dark">Staff workspace</Link>}
        </nav>
      </aside>
      <main id="main-content" className="safe-bottom min-w-0 px-4 py-7 sm:px-7 sm:py-9 lg:px-10 lg:py-10">{children}</main>
    </div>
  </div>;
}
