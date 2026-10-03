import Link from "next/link";
import type { Area, Principal } from "@/lib/auth/access";
import { ShellNav } from "./shell-nav";
import { logoutAction } from "@/features/auth/actions";

export function AppShell({ area, principal, children }: { area: Area; principal: Principal; children: React.ReactNode }) {
  const titles = { admin: "Business workspace", staff: "Staff workspace", account: "Your account" };
  return <div className="min-h-screen bg-canvas">
    <a href="#main-content" className="sr-only z-50 rounded-lg bg-surface p-3 focus:not-sr-only focus:fixed">Skip to content</a>
    <header className="border-b border-line bg-surface px-5 py-4 sm:px-8">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
        <div><Link href="/" className="eyebrow">Appointment studio</Link><p className="mt-1 text-lg font-semibold tracking-tight text-ink">{titles[area]}</p></div>
        <div className="flex items-center gap-3 text-sm"><span className="hidden max-w-56 truncate text-muted sm:block">{principal.email}</span><form action={logoutAction}><button className="button-secondary min-h-10 px-4 py-2">Sign out</button></form></div>
      </div>
    </header>
    <div className="mx-auto max-w-[1500px] lg:grid lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="lg:min-h-[calc(100vh-81px)] lg:border-r lg:border-line lg:bg-surface">
        <ShellNav area={area} principal={principal} />
        <nav aria-label="Switch workspace" className="hidden flex-wrap gap-3 border-t border-line px-5 py-5 text-xs font-semibold text-accent-dark lg:flex lg:flex-col">
          {area !== "account" && <Link href="/account">Customer account</Link>}
          {area !== "admin" && principal.roles.some(role => role === "OWNER" || role === "ADMIN") && <Link href="/admin">Business workspace</Link>}
          {area !== "staff" && principal.roles.includes("STAFF") && principal.staffActive && <Link href="/staff">Staff workspace</Link>}
        </nav>
      </aside>
      <main id="main-content" className="safe-bottom min-w-0 px-4 py-7 sm:px-8 lg:p-10">{children}</main>
    </div>
  </div>;
}
