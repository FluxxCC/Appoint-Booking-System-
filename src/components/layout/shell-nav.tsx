"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigation } from "./navigation";
import type { Area, Principal } from "@/lib/auth/access";
import { NavIcon } from "@/components/ui/nav-icon";

type Item = (typeof navigation)[Area][number];

function iconFor(href: string) {
  if (href.endsWith("/services")) return "services" as const;
  if (href.endsWith("/staff") || href.endsWith("/team")) return "team" as const;
  if (href.endsWith("/calendar") || href.endsWith("/availability")) return "calendar" as const;
  if (href.endsWith("/appointments") || href.endsWith("/payments")) return "appointments" as const;
  if (href.endsWith("/profile") || href.endsWith("/customers") || href.endsWith("/access")) return "profile" as const;
  return "home" as const;
}

function groupsFor(area: Area, items: readonly Item[]) {
  const groups: { label: string; routes: string[] }[] = area === "admin" ? [
    { label: "Overview", routes: ["/admin"] },
    { label: "Bookings", routes: ["/admin/appointments", "/admin/calendar", "/admin/availability"] },
    { label: "People", routes: ["/admin/staff", "/admin/access", "/admin/customers"] },
    { label: "Business", routes: ["/admin/services", "/admin/announcements", "/admin/settings", "/admin/closures", "/admin/appearance"] },
    { label: "Operations", routes: ["/admin/payments", "/admin/notifications", "/admin/reports"] },
  ] : area === "staff" ? [
    { label: "My workspace", routes: ["/staff"] },
    { label: "Schedule", routes: ["/staff/calendar", "/staff/appointments", "/staff/availability"] },
    { label: "My details", routes: ["/staff/profile"] },
  ] : [
    { label: "My account", routes: ["/account"] },
    { label: "Appointments & payments", routes: ["/account/appointments", "/account/payments"] },
    { label: "Personal details", routes: ["/account/profile"] },
  ];

  return groups.map(group => ({ ...group, items: items.filter(item => group.routes.includes(item.href)) })).filter(group => group.items.length > 0);
}

function closeMobileMenu(event: React.MouseEvent<HTMLAnchorElement>) {
  event.currentTarget.closest("details")?.removeAttribute("open");
}

export function ShellNav({ area, principal }: { area: Area; principal: Principal }) {
  const pathname = usePathname();
  const items = navigation[area].filter(item =>
    (item.href !== "/admin/access" || principal.roles.includes("OWNER")) &&
    (item.href !== "/admin/notifications" || principal.roles.includes("OWNER"))
  );
  const groups = groupsFor(area, items);
  const primary = area === "admin" ? ["/admin", "/admin/appointments", "/admin/calendar", "/admin/services"] : area === "staff" ? ["/staff", "/staff/calendar", "/staff/appointments", "/staff/availability"] : ["/account", "/account/appointments", "/account/payments", "/account/profile"];
  const activeFor = (href: string) => pathname === href || (href !== `/${area}` && pathname.startsWith(`${href}/`));

  return <>
    <details className="group border-b border-line bg-white lg:hidden">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-lg bg-accent-soft text-accent-dark"><NavIcon name={iconFor(items.find(item => activeFor(item.href))?.href ?? `/${area}`)}/></span>Explore {area === "admin" ? "workspace" : area === "account" ? "account" : "schedule"}</span>
        <span aria-hidden="true" className="text-accent-dark transition group-open:rotate-180">⌄</span>
      </summary>
      <nav aria-label={`${area} menu`} className="grid grid-cols-2 gap-2 border-t border-line bg-canvas/70 p-3">
        {items.map(item => <Link key={item.href} href={item.href} onClick={closeMobileMenu} aria-current={activeFor(item.href) ? "page" : undefined} className={`flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm ${activeFor(item.href) ? "bg-accent-soft font-semibold text-accent-dark" : "text-muted hover:bg-white hover:text-ink"}`}><NavIcon name={iconFor(item.href)}/><span>{item.label}</span></Link>)}
      </nav>
    </details>

    <nav aria-label={`${area} navigation`} className="hidden space-y-5 px-3 py-5 lg:block">
      {groups.map(group => <section key={group.label}>
        <h2 className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[.16em] text-muted">{group.label}</h2>
        <ul className="space-y-1">{group.items.map(item => {
          const active = activeFor(item.href);
          return <li key={item.href}><Link href={item.href} aria-current={active ? "page" : undefined} className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${active ? "bg-accent-soft text-accent-dark" : "text-muted hover:bg-canvas hover:text-ink"}`}><span className={`grid size-8 place-items-center rounded-lg ${active ? "bg-white text-accent-dark shadow-sm" : "text-muted group-hover:text-accent-dark"}`}><NavIcon name={iconFor(item.href)}/></span><span className="truncate">{item.label}</span>{active && <span aria-hidden="true" className="ml-auto size-1.5 rounded-full bg-accent"/>}</Link></li>;
        })}</ul>
      </section>)}
    </nav>

    <nav aria-label={`${area} quick navigation`} className="fixed inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-40 grid grid-cols-4 rounded-2xl border border-line bg-white/95 p-1.5 shadow-[0_12px_40px_-22px_#17263a88] backdrop-blur-md lg:hidden">
      {items.filter(item => primary.includes(item.href)).map(item => <Link key={item.href} href={item.href} aria-current={activeFor(item.href) ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-center text-[10px] font-semibold leading-tight ${activeFor(item.href) ? "bg-accent-soft text-accent-dark" : "text-muted"}`}><NavIcon name={iconFor(item.href)}/><span className="max-w-full truncate">{item.label}</span></Link>)}
    </nav>
  </>;
}
