import { requireArea } from "@/lib/auth/access.server";
import { AppearanceForm } from "@/features/admin/appearance-form";

export const dynamic = "force-dynamic";

export default async function AppearancePage() {
  const { supabase } = await requireArea("admin");
  const [{ data: settings, error }, { data: business }] = await Promise.all([
    supabase.from("website_settings").select("id,logo_path,hero_image_path,primary_color,font_key,sections,published,updated_at").eq("singleton", true).maybeSingle(),
    supabase.from("business_settings").select("name").maybeSingle(),
  ]);
  if (error) throw new Error("Website appearance could not be loaded. Please refresh and try again.");

  const sections = settings?.sections && typeof settings.sections === "object" && !Array.isArray(settings.sections)
    ? settings.sections as Record<string, unknown>
    : {};

  return <AppearanceForm settings={{
    logo_path: settings?.logo_path ?? null,
    hero_image_path: settings?.hero_image_path ?? null,
    primary_color: settings?.primary_color ?? "#0f766e",
    font_key: settings?.font_key ?? "system",
    about: typeof sections.about === "string" ? sections.about : "",
    published: settings?.published ?? true,
    updated_at: settings?.updated_at ?? "",
    business_name: business?.name ?? "Your business",
  }} />;
}
