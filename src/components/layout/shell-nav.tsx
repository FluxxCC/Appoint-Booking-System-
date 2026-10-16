"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigation } from "./navigation";
import type { Area, Principal } from "@/lib/auth/access";
import { NavIcon, type IconName } from "@/components/ui/nav-icon";

type Item = (typeof navigation)[Area][number];

const iconsByRoute: Record<string, IconName> = {
  "/admin": "dashboard",
  "/admin/appointments": "appointments",
  "/admin/home-service": "home-service",
  "/admin/calendar": "calendar",
  "/admin/availability": "availability",
  "/admin/staff": "team",
  "/admin/access": "access",
  "/admin/customers": "customers",
  "/admin/services": "services",
  "/admin/branches": "settings",
  "/admin/announcements": "announcements",
  "/admin/settings": "settings",
  "/admin/closures": "closures",
  "/admin/payments": "payments",
  "/admin/reports": "reports",
  "/staff": "dashboard",
  "/staff/calendar": "calendar",
  "/staff/appointments": "appointments",
  "/staff/home-service": "home-service",
  "/staff/availability": "availability",
  "/account": "profile",
  "/account/appointments": "appointments",
  "/account/payments": "payments",
  "/account/profile": "profile",
};

function iconFor(href: string): IconName {
  return iconsByRoute[href] ?? "home";
}

function groupsFor(area: Area, items: readonly Item[]) {
  const groups: { label: string; routes: string[] }[] = area === "admin" ? [
    { label: "Overview", routes: ["/admin"] },
    { label: "Bookings", routes: ["/admin/appointments", "/admin/home-service", "/admin/calendar", "/admin/availability"] },
    { label: "People", routes: ["/admin/staff", "/admin/access", "/admin/customers"] },
    { label: "Business", routes: ["/admin/services", "/admin/branches", "/admin/announcements", "/admin/settings", "/admin/closures"] },
    { label: "Operations", routes: ["/admin/payments", "/admin/reports"] },
  ] : area === "staff" ? [
    { label: "My workspace", routes: ["/staff"] },
    { label: "Schedule", routes: ["/staff/calendar", "/staff/appointments", "/staff/home-service", "/staff/availability"] },
  ] : [
    { label: "My account", routes: ["/account"] },
    { label: "Appointments & payments", routes: ["/account/appointments", "/account/payments"] },
    { label: "Personal details", routes: ["/account/profile"] },
  ];

  return groups.map(group => ({ ...group, items: items.filter(item => group.routes.includes(item.href)) })).filter(group => group.items.length > 0);
}

function closeMobileSidebar() {
  if (window.matchMedia("(max-width: 639px)").matches) {
    const toggle = document.getElementById("workspace-sidebar-toggle");
    if (toggle instanceof HTMLInputElement) toggle.checked = false;
  }
}

export function ShellNav({ area, principal, counts = {} }: { area: Area; principal: Principal; counts?: Record<string, number> }) {
  const pathname = usePathname();
  const items = navigation[area].filter(item =>
    (item.href !== "/admin/access" || principal.roles.includes("OWNER")) &&
    (item.href !== "/admin/branches" || principal.roles.includes("OWNER"))
  );
  const groups = groupsFor(area, items);
  const activeFor = (href: string) => pathname === href || (href !== `/${area}` && pathname.startsWith(`${href}/`));
  const groupItems = (group: (typeof groups)[number]) => <ul className="workspace-nav-list space-y-1">{group.items.map(item => {
    const active = activeFor(item.href);
    const count = counts[item.href] ?? 0;
    function closeMenu() { closeMobileSidebar(); }
    const badgeLabel = item.href.includes("home-service") ? `${count} active Home Service bookings` : `${count} pending appointment requests`;
    return <li key={item.href}><Link href={item.href} title={item.label} onClick={closeMenu} aria-current={active ? "page" : undefined} className={`workspace-nav-item group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${active ? "bg-accent text-white shadow-[0_8px_20px_-14px_#573d27]" : "text-muted hover:bg-canvas hover:text-ink"}`}><span className={`workspace-nav-icon grid size-8 place-items-center rounded-lg ${active ? "bg-white/15 text-white" : "bg-canvas text-muted group-hover:bg-white group-hover:text-accent-dark group-hover:shadow-sm"}`}><NavIcon name={iconFor(item.href)}/></span><span className="workspace-nav-label truncate">{item.label}</span>{count > 0 && <span aria-label={badgeLabel} className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-4 text-white">{count > 99 ? "99+" : count}</span>}{active && count === 0 && <span aria-hidden="true" className="workspace-nav-active-dot ml-auto size-1.5 rounded-full bg-white"/>}</Link></li>;
  })}</ul>;

  return <nav aria-label={`${area} navigation`} onKeyDown={event => { if (event.key === "Escape") closeMobileSidebar(); }} className="workspace-navigation space-y-5 px-3 pb-6 pt-4 sm:px-4 sm:pt-5">
      {groups.map(group => <section key={group.label} className="workspace-nav-section">
        <h2 className="workspace-nav-section-title px-2 pb-2 text-[10px] font-bold uppercase tracking-[.16em] text-muted">{group.label}</h2>
        {groupItems(group)}
      </section>)}
    </nav>
}
