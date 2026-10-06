import { SiteFooter } from "@/components/public-site/site";
import { PublicNav } from "@/components/public-site/public-nav";
import { AnnouncementBanner } from "@/components/public-site/announcement-banner";
import { imageUrl, readPublicWebsite } from "@/features/public-site/data.server";
import { getAccess } from "@/lib/auth/access.server";
import { RealtimeRefresh } from "@/components/layout/realtime-refresh";
import type { CSSProperties } from "react";
export const dynamic = "force-dynamic";

function darker(hex: string, factor = 0.2) {
  const value = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.slice(1) : "3549ee";
  return `#${[0,2,4].map(offset=>Math.round(parseInt(value.slice(offset,offset+2),16)*(1-factor)).toString(16).padStart(2,"0")).join("")}`;
}

function softer(hex: string) {
  const value = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.slice(1) : "3549ee";
  return `#${[0,2,4].map(offset=>Math.round(parseInt(value.slice(offset,offset+2),16)*0.12+255*0.88).toString(16).padStart(2,"0")).join("")}`;
}

function accentText(hex: string) {
  const value = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.slice(1) : "3549ee";
  const channels = [0,2,4].map(offset => parseInt(value.slice(offset,offset+2),16)/255).map(channel => channel <= 0.04045 ? channel/12.92 : ((channel+0.055)/1.055)**2.4);
  const luminance = channels[0]*0.2126 + channels[1]*0.7152 + channels[2]*0.0722;
  return luminance > 0.42 ? "#1c2853" : "#ffffff";
}

export default async function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [site, access] = await Promise.all([readPublicWebsite(), getAccess().catch(() => ({ principal: null }))]);
  const name = site.business?.name ?? "Our Studio";
  const logo = imageUrl(site.website?.logo_path);
  const accent = site.website?.primary_color ?? "#3549ee";
  const family = site.website?.font_key === "serif" ? 'Georgia, "Times New Roman", serif' : site.website?.font_key === "sans" ? "Arial, Helvetica, sans-serif" : '"Segoe UI", Arial, Helvetica, sans-serif';
  const theme = {
    "--color-accent": accent,
    "--color-accent-dark": darker(accent),
    "--color-accent-soft": softer(accent),
    "--color-on-dark-accent": accentText(accent),
    "--font-sans": family,
    "--font-display": family,
  } as CSSProperties;
  return <div className="min-h-screen bg-canvas text-ink" style={theme}><RealtimeRefresh scope="public"/><PublicNav name={name} logo={logo} principal={access.principal}/><AnnouncementBanner announcement={site.announcements[0]??null}/><div className="min-w-0">{children}<SiteFooter site={site}/></div></div>;
}
