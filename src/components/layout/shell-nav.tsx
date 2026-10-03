"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigation } from "./navigation";
import type { Area, Principal } from "@/lib/auth/access";
import { NavIcon } from "@/components/ui/nav-icon";

export function ShellNav({ area, principal }: { area: Area; principal: Principal }) {
  const pathname = usePathname();
  const items = navigation[area].filter(item => item.href !== "/admin/access" || principal.roles.includes("OWNER"));
  const primary = area === "admin" ? ["/admin", "/admin/appointments", "/admin/calendar", "/admin/services"] : area === "staff" ? ["/staff", "/staff/calendar", "/staff/appointments", "/staff/availability"] : ["/account", "/account/appointments", "/account/payments", "/account/profile"];
  const iconFor = (href: string) => href.endsWith("/services") ? "services" as const : href.endsWith("/profile") ? "profile" as const : href.endsWith("/calendar") || href.endsWith("/availability") ? "calendar" as const : href.endsWith("/appointments") || href.endsWith("/payments") ? "appointments" as const : "home" as const;
  const activeFor = (href: string) => pathname === href || (href !== `/${area}` && pathname.startsWith(`${href}/`));
  return <><details className="group border-b border-line bg-surface lg:hidden"><summary className="flex min-h-12 cursor-pointer items-center justify-between px-5 text-sm font-semibold text-ink">Explore workspace <span aria-hidden="true" className="text-accent-dark group-open:rotate-180">⌄</span></summary><nav aria-label={`${area} menu`} className="grid grid-cols-2 gap-2 border-t border-line p-3">{items.map(item=><Link key={item.href} href={item.href} aria-current={activeFor(item.href)?"page":undefined} className={`rounded-xl px-3 py-3 text-sm ${activeFor(item.href)?"bg-accent-soft font-semibold text-accent-dark":"text-muted hover:bg-canvas"}`}>{item.label}</Link>)}</nav></details>
  <nav aria-label={`${area} navigation`} className="hidden space-y-1 p-4 lg:block">
    {items.map(item => {
      const active=pathname===item.href || (item.href!==`/${area}` && pathname.startsWith(`${item.href}/`));
      return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
      className={`block rounded-xl px-4 py-3 text-sm font-medium ${active ? "bg-accent-soft text-accent-dark" : "text-muted hover:bg-canvas hover:text-ink"}`}>{item.label}</Link>;
    })}
  </nav><nav aria-label={`${area} quick navigation`} className="fixed inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-40 grid grid-cols-4 rounded-[1.4rem] border border-line bg-surface/95 p-1.5 shadow-[0_12px_40px_-18px_#382a3566] backdrop-blur-md lg:hidden">{items.filter(item=>primary.includes(item.href)).map(item=><Link key={item.href} href={item.href} aria-current={activeFor(item.href)?"page":undefined} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-center text-[11px] font-semibold leading-tight ${activeFor(item.href)?"bg-accent-soft text-accent-dark":"text-muted"}`}><NavIcon name={iconFor(item.href)}/>{item.label}</Link>)}</nav></>;
}
