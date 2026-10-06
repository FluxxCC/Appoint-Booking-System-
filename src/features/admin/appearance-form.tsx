"use client";

import Image from "next/image";
import { useActionState, useEffect, useState } from "react";
import { saveAppearance } from "./appearance-actions";
import type { FormState } from "@/features/auth/schemas";

type AppearanceSettings = {
  logo_path: string | null;
  hero_image_path: string | null;
  primary_color: string;
  font_key: string;
  about: string;
  published: boolean;
  updated_at: string;
  business_name: string;
};

const input = "field-control text-sm";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
function publicImage(path: string | null) {
  if (!path || !supabaseUrl) return null;
  return `${supabaseUrl}/storage/v1/object/public/catalog-images/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function fontFamily(key: string) {
  if (key === "serif") return 'Georgia, "Times New Roman", serif';
  if (key === "sans") return "Arial, Helvetica, sans-serif";
  return '"Segoe UI", Arial, Helvetica, sans-serif';
}

export function AppearanceForm({ settings }: { settings: AppearanceSettings }) {
  const [state, dispatch, pending] = useActionState(saveAppearance, {} as FormState);
  const [color, setColor] = useState(settings.primary_color);
  const [font, setFont] = useState(settings.font_key);
  const [about, setAbout] = useState(settings.about);
  const validColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#0f766e";
  const logoUrl = publicImage(settings.logo_path);
  const heroUrl = publicImage(settings.hero_image_path);
  const [logoPreview, setLogoPreview] = useState(logoUrl);
  const [heroPreview, setHeroPreview] = useState(heroUrl);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [removeHero, setRemoveHero] = useState(false);
  useEffect(() => () => {
    if (logoPreview?.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
    if (heroPreview?.startsWith("blob:")) URL.revokeObjectURL(heroPreview);
  }, [logoPreview, heroPreview]);
  const previewStyle = { "--preview-accent": validColor, fontFamily: fontFamily(font) } as React.CSSProperties;

  return <>
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Your public website</p><h1 className="display-type mt-2 text-4xl sm:text-5xl">Appearance</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted">Choose your brand color, typeface and images. Your preview updates as you edit, and publishing refreshes the live website.</p></div><a href="/" target="_blank" rel="noreferrer" className="button-secondary min-h-11">View website ↗</a></div>

    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
      <form action={dispatch} aria-busy={pending} encType="multipart/form-data" className="space-y-6">
        <input type="hidden" name="expected_updated_at" value={settings.updated_at}/>
        <fieldset disabled={pending} className="space-y-6">
          <section className="surface-card p-5 sm:p-6"><div className="mb-5"><h2 className="text-lg font-semibold">Brand style</h2><p className="mt-1 text-sm leading-6 text-muted">Set the main color and the type style customers see across your website.</p></div>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-medium">Brand color<div className="mt-2 flex gap-2"><input aria-label="Choose brand color" type="color" value={validColor} onChange={event=>setColor(event.target.value)} className="h-12 w-16 cursor-pointer rounded-lg border border-line bg-white p-1"/><input aria-label="Brand color hex value" name="primary_color" required pattern="#[0-9a-fA-F]{6}" value={color} onChange={event=>setColor(event.target.value)} className={`${input} min-w-0 flex-1 font-mono uppercase`}/></div><span className="mt-2 block text-xs leading-5 text-muted">Choose a medium or dark color for clear button contrast.</span></label>
              <label className="block text-sm font-medium">Website typeface<select name="font_key" value={font} onChange={event=>setFont(event.target.value)} className={`${input} mt-2`}><option value="system">System · familiar and clean</option><option value="sans">Sans serif · simple and modern</option><option value="serif">Serif · classic and editorial</option></select><span className="mt-2 block text-xs leading-5 text-muted">Preview the heading and button on the right.</span></label>
            </div>
          </section>

          <section className="surface-card p-5 sm:p-6"><div className="mb-5"><h2 className="text-lg font-semibold">Website images</h2><p className="mt-1 text-sm leading-6 text-muted">Upload a logo and a wide hero image. Images are resized for the website; still JPEG, PNG or WebP files up to 2 MiB are accepted.</p></div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="rounded-xl border border-line bg-canvas/50 p-4"><label className="block text-sm font-semibold">Logo<input type="file" name="logo_image" accept="image/jpeg,image/png,image/webp" onChange={event=>{const file=event.target.files?.[0];setRemoveLogo(false);setLogoPreview(file?URL.createObjectURL(file):logoUrl);}} className="mt-3 block w-full text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:font-semibold file:text-accent-dark"/></label>{logoPreview&&!removeLogo&&<Image unoptimized src={logoPreview} alt="Website logo preview" width={240} height={120} className="mt-4 max-h-20 w-auto rounded-lg bg-white p-2 object-contain"/>}{settings.logo_path&&<label className="mt-4 flex items-center gap-2 text-xs text-muted"><input type="checkbox" name="remove_logo" checked={removeLogo} onChange={event=>setRemoveLogo(event.target.checked)} className="size-4 accent-accent"/>Remove current logo</label>}</div>
              <div className="rounded-xl border border-line bg-canvas/50 p-4"><label className="block text-sm font-semibold">Hero image<input type="file" name="hero_image" accept="image/jpeg,image/png,image/webp" onChange={event=>{const file=event.target.files?.[0];setRemoveHero(false);setHeroPreview(file?URL.createObjectURL(file):heroUrl);}} className="mt-3 block w-full text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:font-semibold file:text-accent-dark"/></label>{heroPreview&&!removeHero&&<Image unoptimized src={heroPreview} alt="Hero image preview" width={320} height={180} className="mt-4 aspect-video w-full rounded-lg object-cover"/>}{settings.hero_image_path&&<label className="mt-4 flex items-center gap-2 text-xs text-muted"><input type="checkbox" name="remove_hero" checked={removeHero} onChange={event=>setRemoveHero(event.target.checked)} className="size-4 accent-accent"/>Remove current hero image</label>}</div>
            </div>
          </section>

          <section className="surface-card p-5 sm:p-6"><div className="mb-4"><h2 className="text-lg font-semibold">About page</h2><p className="mt-1 text-sm leading-6 text-muted">Add an optional paragraph about what makes your business special.</p></div><label className="block text-sm font-medium">Your story<textarea name="about" value={about} onChange={event=>setAbout(event.target.value)} maxLength={5000} rows={5} className={`${input} mt-2 min-h-32 resize-y leading-6`} placeholder="Tell customers what they can expect when they visit."/></label></section>

          <section className="rounded-2xl border border-accent/20 bg-accent-soft/40 p-5 sm:p-6"><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" name="published" defaultChecked={settings.published} className="mt-1 size-5 shrink-0 accent-accent"/><span><span className="block font-semibold">Publish changes to my website</span><span className="mt-1 block text-sm leading-6 text-muted">When checked, saving updates the public website and refreshes visitors who have it open. Clear this box to save a private draft.</span></span></label></section>

          {state.error&&<p role="alert" className="rounded-xl border border-danger/20 bg-danger-soft p-4 text-sm leading-6 text-danger">{state.error}</p>}
          {state.success&&<p role="status" className="rounded-xl border border-accent/15 bg-accent-soft p-4 text-sm leading-6 text-accent-dark">{state.success}</p>}
          <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white/95 p-3 shadow-lg backdrop-blur"><span className="px-2 text-xs text-muted">Save when your preview looks right.</span><button className="button-primary min-h-11" disabled={pending}>{pending?"Saving appearance…":"Save appearance"}</button></div>
        </fieldset>
      </form>

      <aside className="xl:sticky xl:top-24"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Live preview</h2><span className="rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">Updates as you edit</span></div><div className="overflow-hidden rounded-[1.5rem] border border-line bg-white shadow-lg" style={previewStyle}><div className="flex min-h-16 items-center gap-3 border-b border-line px-5"><span className="grid size-10 place-items-center overflow-hidden rounded-xl bg-canvas">{logoPreview&&!removeLogo?<Image unoptimized src={logoPreview} alt="" width={40} height={40} className="size-10 object-contain"/>:<span className="font-bold" style={{color:validColor}}>{settings.business_name.charAt(0)}</span>}</span><span className="truncate font-semibold">{settings.business_name}</span></div>{heroPreview&&!removeHero?<div className="relative aspect-[16/8] bg-canvas"><Image unoptimized src={heroPreview} alt="Hero image preview" fill className="object-cover"/></div>:<div className="flex aspect-[16/8] items-center justify-center bg-canvas px-5 text-center text-sm text-muted">Your hero image will appear here</div>}<div className="p-5 sm:p-6"><p className="text-xs font-bold uppercase tracking-[.16em]" style={{color:validColor}}>Plan your next visit</p><h3 className="mt-2 text-2xl font-bold leading-tight" style={{fontFamily:fontFamily(font)}}>A place made for your next visit.</h3><p className="mt-3 text-sm leading-6 text-muted">{about.trim()||"Your About page story will appear here when you add it."}</p><button type="button" className="mt-5 rounded-xl px-4 py-3 text-sm font-bold text-white" style={{backgroundColor:validColor,fontFamily:fontFamily(font)}}>Book an appointment</button></div></div><p className="mt-3 text-xs leading-5 text-muted">Preview changes are private until you save and publish.</p></aside>
    </div>
  </>;
}
