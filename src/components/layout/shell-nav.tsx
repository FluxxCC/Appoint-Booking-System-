"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";
import { navigation } from "./navigation";
import type { Area, Principal } from "@/lib/auth/access";
import { NavIcon, type IconName } from "@/components/ui/nav-icon";

type Item = (typeof navigation)[Area][number];

const iconsByRoute: Record<string, IconName> = {
  "/admin": "dashboard",
  "/admin/appointments": "appointments",
  "/admin/calendar": "calendar",
  "/admin/availability": "availability",
  "/admin/staff": "team",
  "/admin/access": "access",
  "/admin/customers": "customers",
  "/admin/services": "services",
  "/admin/announcements": "announcements",
  "/admin/settings": "settings",
  "/admin/closures": "closures",
  "/admin/appearance": "appearance",
  "/admin/payments": "payments",
  "/admin/notifications": "notifications",
  "/admin/reports": "reports",
  "/staff": "dashboard",
  "/staff/calendar": "calendar",
  "/staff/appointments": "appointments",
  "/staff/availability": "availability",
  "/staff/profile": "profile",
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

function closeMobileMenu(event: React.MouseEvent<HTMLElement>) {
  event.currentTarget.closest("details")?.removeAttribute("open");
}

const sessionSeen = new Map<string, Set<string>>();

function storageKey(userId: string, href: string) {
  return `workspace-badge-seen:${userId}:${href}`;
}

function seenIds(userId: string, href: string) {
  const key = storageKey(userId, href);
  const seen = new Set(sessionSeen.get(key) ?? []);
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (Array.isArray(stored)) {
      for (const id of stored) if (typeof id === "string") seen.add(id);
    }
  } catch {
    // Session memory still clears badges if browser storage is unavailable.
  }
  return seen;
}

function subscribeBadgeStore(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("workspace-badge-seen", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("workspace-badge-seen", onChange);
  };
}

export function ShellNav({ area, principal, badges = {} }: { area: Area; principal: Principal; badges?: Record<string, string[]> }) {
  const pathname = usePathname();
  const badgeSnapshot = JSON.stringify(badges);
  const getSnapshot = useCallback(() => {
    const current = JSON.parse(badgeSnapshot) as Record<string, string[]>;
    const next: Record<string, string[]> = {};
    for (const [href, ids] of Object.entries(current)) {
      const seen = seenIds(principal.userId, href);
      next[href] = ids.filter(id => !seen.has(id));
    }
    return JSON.stringify(next);
  }, [badgeSnapshot, principal.userId]);
  const getServerSnapshot = useCallback(() => badgeSnapshot, [badgeSnapshot]);
  const unseen = JSON.parse(useSyncExternalStore(subscribeBadgeStore, getSnapshot, getServerSnapshot)) as Record<string, string[]>;
  const items = navigation[area].filter(item =>
    (item.href !== "/admin/access" || principal.roles.includes("OWNER")) &&
    (item.href !== "/admin/notifications" || principal.roles.includes("OWNER"))
  );
  const groups = groupsFor(area, items);
  const activeFor = (href: string) => pathname === href || (href !== `/${area}` && pathname.startsWith(`${href}/`));
  const groupItems = (group: (typeof groups)[number], mobile = false) => <ul className="workspace-nav-list space-y-1">{group.items.map(item => {
    const active = activeFor(item.href);
    const ids = badges[item.href] ?? [];
    const count = unseen[item.href]?.length ?? 0;
    function markSeen(event: React.MouseEvent<HTMLAnchorElement>) {
      if (ids.length) {
        try {
          const key = storageKey(principal.userId, item.href);
          const prior = JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
          const seen = new Set([...prior, ...ids]);
          sessionSeen.set(key, seen);
          localStorage.setItem(key, JSON.stringify([...seen].slice(-1000)));
        } catch { /* The badge still clears for this visit if browser storage is unavailable. */ }
        const key = storageKey(principal.userId, item.href);
        sessionSeen.set(key, new Set([...(sessionSeen.get(key) ?? []), ...ids]));
        window.dispatchEvent(new Event("workspace-badge-seen"));
      }
      if (mobile) closeMobileMenu(event);
    }
    return <li key={item.href}><Link href={item.href} title={item.label} onClick={markSeen} aria-current={active ? "page" : undefined} className={`workspace-nav-item group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${active ? "bg-accent text-white shadow-[0_8px_20px_-14px_#2538d0]" : "text-muted hover:bg-canvas hover:text-ink"}`}><span className={`workspace-nav-icon grid size-8 place-items-center rounded-lg ${active ? "bg-white/15 text-white" : "bg-canvas text-muted group-hover:bg-white group-hover:text-accent-dark group-hover:shadow-sm"}`}><NavIcon name={iconFor(item.href)}/></span><span className="workspace-nav-label truncate">{item.label}</span>{count > 0 && <span aria-label={`${count} new appointment requests`} className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-4 text-white">{count > 99 ? "99+" : count}</span>}{active && count === 0 && <span aria-hidden="true" className="workspace-nav-active-dot ml-auto size-1.5 rounded-full bg-white"/>}</Link></li>;
  })}</ul>;

  return <>
    <details onKeyDown={event => { if (event.key === "Escape") event.currentTarget.removeAttribute("open"); }} className="group border-b border-line bg-white sm:hidden">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-lg bg-accent-soft text-accent-dark"><NavIcon name={iconFor(items.find(item => activeFor(item.href))?.href ?? `/${area}`)}/></span>Menu <span className="font-normal text-muted">/ {items.find(item => activeFor(item.href))?.label ?? "Workspace"}</span></span>
        <span aria-hidden="true" className="text-xl leading-none text-accent-dark">☰</span>
      </summary>
      <div className="fixed inset-x-0 bottom-0 top-[124px] z-40 hidden group-open:block">
        <button type="button" aria-label="Close menu" onClick={closeMobileMenu} className="absolute inset-0 w-full bg-ink/40" />
        <nav aria-label={`${area} menu`} className="relative h-full w-[min(86vw,320px)] overflow-y-auto border-r border-line bg-white px-3 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl">
          <div className="mb-4 flex items-center justify-between border-b border-line px-2 pb-4"><p className="eyebrow">{area === "admin" ? "Business" : area === "staff" ? "Staff" : "Account"} menu</p><button type="button" onClick={closeMobileMenu} className="rounded-lg px-2 py-1 text-sm font-semibold text-muted hover:bg-canvas hover:text-ink">Close</button></div>
          {groups.map(group => <section key={group.label} className="mb-5"><h2 className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[.16em] text-muted">{group.label}</h2>{groupItems(group, true)}</section>)}
        </nav>
      </div>
    </details>

    <nav aria-label={`${area} navigation`} className="workspace-navigation hidden space-y-5 px-4 pb-6 pt-5 sm:block">
      {groups.map(group => <section key={group.label} className="workspace-nav-section">
        <h2 className="workspace-nav-section-title px-2 pb-2 text-[10px] font-bold uppercase tracking-[.16em] text-muted">{group.label}</h2>
        {groupItems(group)}
      </section>)}
    </nav>

  </>;
}
