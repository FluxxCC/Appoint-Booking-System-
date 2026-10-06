"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { Principal } from "@/lib/auth/access";
import { logoutAction } from "@/features/auth/actions";
import { NavIcon } from "@/components/ui/nav-icon";

const links = [
  { label: "Home", href: "/", icon: "home" as const },
  { label: "Services", href: "/services", icon: "services" as const },
  { label: "Our team", href: "/team", icon: "team" as const },
  { label: "About", href: "/about", icon: "profile" as const },
  { label: "Contact", href: "/contact", icon: "profile" as const },
  { label: "Manage booking", href: "/booking/manage", icon: "appointments" as const },
];

function AccountLinks({ principal, close, compact = false }: { principal: Principal | null; close?: () => void; compact?: boolean }) {
  if (!principal) return <>
    <Link href="/login" onClick={close} className={compact ? "rounded-lg px-3 py-2 text-sm font-semibold text-accent-dark hover:bg-accent-soft" : "button-secondary min-h-11 w-full"}>Sign in</Link>
    <Link href="/register" onClick={close} className={compact ? "hidden whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:bg-canvas hover:text-ink xl:inline" : "mt-2 block rounded-xl px-3 py-2 text-center text-sm font-semibold text-accent-dark hover:bg-accent-soft"}>Create customer account</Link>
  </>;

  const accountHref = principal.roles.some(role => role === "OWNER" || role === "ADMIN") ? "/admin" : principal.roles.includes("STAFF") ? "/staff" : "/account";
  const accountLabel = accountHref === "/account" ? "My account" : "Workspace";
  return <>
    <Link href={accountHref} onClick={close} className={compact ? "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-ink hover:bg-canvas" : "button-secondary min-h-11 w-full"}>{accountLabel}</Link>
    <form action={logoutAction} className={compact ? "inline-flex" : "mt-2"}><button className={compact ? "rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:bg-canvas" : "w-full rounded-xl px-3 py-2 text-center text-sm font-semibold text-muted hover:bg-canvas"}>Sign out</button></form>
  </>;
}

function Brand({ name, logo, onClick }: { name: string; logo: string | null; onClick?: () => void }) {
  return <Link href="/" onClick={onClick} className="flex min-h-11 min-w-0 items-center gap-3 text-lg font-semibold tracking-tight text-ink">
    {logo ? <Image src={logo} alt="" width={40} height={40} unoptimized className="size-10 shrink-0 rounded-xl object-contain" /> : <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft display-type text-2xl text-accent-dark">{name.charAt(0)}</span>}
    <span className="truncate">{name}</span>
  </Link>;
}

function Navigation({ pathname, closeDrawer, mobile = false }: { pathname: string; closeDrawer: () => void; mobile?: boolean }) {
  const activeFor = (href: string) => pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
  return <nav aria-label={mobile ? "Site menu" : "Main navigation"} className={mobile ? "space-y-1" : "flex items-center gap-0.5 whitespace-nowrap"}>
    {links.map(item => {
      const active = activeFor(item.href);
      return <Link key={item.href} href={item.href} onClick={mobile ? closeDrawer : undefined} aria-current={active ? "page" : undefined} className={mobile ? `group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${active ? "bg-accent-soft font-semibold text-accent-dark" : "text-muted hover:bg-canvas hover:text-ink"}` : `rounded-lg px-2 py-2 text-[13px] font-medium transition xl:px-2.5 xl:text-sm ${active ? "bg-accent-soft font-semibold text-accent-dark" : "text-muted hover:bg-canvas hover:text-ink"}`}>
        {mobile && <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${active ? "bg-white text-accent-dark shadow-sm" : "text-muted group-hover:text-accent-dark"}`}><NavIcon name={item.icon} /></span>}
        <span className="truncate">{item.label}</span>{mobile && active && <span aria-hidden="true" className="ml-auto size-1.5 rounded-full bg-accent" />}
      </Link>;
    })}
  </nav>;
}

export function PublicNav({ name, logo, principal }: { name: string; logo: string | null; principal: Principal | null }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = () => setDrawerOpen(false);

  return <>
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex min-h-[72px] max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6 lg:gap-4 lg:px-8">
        <div className="flex min-w-0 items-center gap-3 lg:hidden">
          <button type="button" aria-label={drawerOpen ? "Close navigation" : "Open navigation"} aria-expanded={drawerOpen} aria-controls="public-navigation-drawer" onClick={() => setDrawerOpen(open => !open)} className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-white text-ink hover:bg-canvas">
            {drawerOpen ? <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>}
          </button>
          <Brand name={name} logo={logo} />
        </div>
        <div className="hidden min-w-0 shrink-0 lg:block"><Brand name={name} logo={logo} /></div>
        <div className="hidden min-w-0 flex-1 justify-center lg:flex"><Navigation pathname={pathname} closeDrawer={closeDrawer} /></div>
        <div className="hidden shrink-0 items-center gap-1 lg:flex"><AccountLinks principal={principal} compact /><Link href="/book" className="button-primary min-h-10 whitespace-nowrap px-3 py-2 xl:px-4">Book now</Link></div>
        <div className="flex shrink-0 items-center gap-2 lg:hidden">
          {!principal ? <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-accent-dark hover:bg-accent-soft">Sign in</Link> : <Link href={principal.roles.some(role => role === "OWNER" || role === "ADMIN") ? "/admin" : principal.roles.includes("STAFF") ? "/staff" : "/account"} className="rounded-lg px-3 py-2 text-sm font-semibold text-accent-dark hover:bg-accent-soft">My account</Link>}
        </div>
      </div>
    </header>
    {drawerOpen && <div id="public-navigation-drawer" className="fixed inset-x-0 bottom-0 top-[72px] z-40 lg:hidden">
      <button type="button" onClick={closeDrawer} aria-label="Close navigation" className="absolute inset-0 bg-ink/35" />
      <div className="relative h-full w-[min(86vw,340px)] overflow-y-auto border-r border-line bg-white px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-5 shadow-2xl">
        <p className="eyebrow mb-3 px-3">Explore</p><Navigation pathname={pathname} closeDrawer={closeDrawer} mobile />
        <div className="mt-5 border-t border-line pt-5"><p className="eyebrow mb-3 px-3">Your account</p><AccountLinks principal={principal} close={closeDrawer} /></div>
        <Link href="/book" onClick={closeDrawer} className="button-primary mt-4 w-full">Book an appointment <span aria-hidden="true">↗</span></Link>
      </div>
    </div>}
  </>;
}
