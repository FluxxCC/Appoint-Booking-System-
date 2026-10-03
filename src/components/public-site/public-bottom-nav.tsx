"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "@/components/ui/nav-icon";

const items = [
  { label: "Home", href: "/", icon: "home" },
  { label: "Services", href: "/services", icon: "services" },
  { label: "Team", href: "/team", icon: "team" },
  { label: "Book", href: "/book", icon: "calendar" },
] as const;

export function PublicBottomNav() {
  const pathname = usePathname();
  return <nav aria-label="Quick navigation" className="fixed inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-30 grid grid-cols-4 rounded-[1.4rem] border border-line bg-surface/95 p-1.5 shadow-[0_12px_40px_-18px_#382a3566] backdrop-blur-md md:hidden">{items.map(item => {
    const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
    return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-semibold ${active ? "bg-accent-soft text-accent-dark" : "text-muted"}`}><NavIcon name={item.icon}/>{item.label}</Link>;
  })}</nav>;
}
