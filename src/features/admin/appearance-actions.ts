"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireArea } from "@/lib/auth/access.server";
import type { FormState } from "@/features/auth/schemas";
import type { Json } from "@/types/database.generated";
import { prepareImage } from "@/features/catalog/images.server";

const schema = z.object({
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  font_key: z.enum(["system", "serif", "sans"]),
  about: z.string().max(5000),
  expected_updated_at: z.string(),
});

const appearancePath = /^appearance\/(logo|hero)\/[0-9a-f-]{36}\.webp$/;

export async function saveAppearance(_state: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireArea("admin");
  const parsed = schema.safeParse({
    primary_color: form.get("primary_color"),
    font_key: form.get("font_key"),
    about: form.get("about"),
    expected_updated_at: form.get("expected_updated_at") ?? "",
  });
  if (!parsed.success) return { error: "Check the brand color, typeface and About text, then try again." };

  const { data: current, error: readError } = await supabase
    .from("website_settings")
    .select("id,logo_path,hero_image_path,sections,published,updated_at")
    .eq("singleton", true)
    .maybeSingle();
  if (readError) return { error: "Appearance settings could not be loaded. Refresh the page before saving." };
  if ((current?.updated_at ?? "") !== parsed.data.expected_updated_at) {
    return { error: "Appearance changed in another session. Refresh this page to review the latest version." };
  }

  const oldPaths = { logo: current?.logo_path ?? null, hero: current?.hero_image_path ?? null };
  const nextPaths = {
    logo: form.get("remove_logo") === "on" ? null : oldPaths.logo,
    hero: form.get("remove_hero") === "on" ? null : oldPaths.hero,
  };
  const uploadedPaths: string[] = [];

  for (const kind of ["logo", "hero"] as const) {
    const file = form.get(`${kind}_image`);
    if (!(file instanceof File) || file.size === 0) continue;
    let bytes: Buffer;
    try {
      bytes = await prepareImage(file);
    } catch {
      if (uploadedPaths.length) await supabase.storage.from("catalog-images").remove(uploadedPaths);
      return { error: "Use a still JPEG, PNG or WebP image up to 2 MiB and 16 megapixels." };
    }
    const path = `appearance/${kind}/${randomUUID()}.webp`;
    const { error } = await supabase.storage.from("catalog-images").upload(path, bytes, { contentType: "image/webp", upsert: false });
    if (error) {
      if (uploadedPaths.length) await supabase.storage.from("catalog-images").remove(uploadedPaths);
      return { error: "Image upload failed. Check the catalog image storage configuration and try again." };
    }
    uploadedPaths.push(path);
    nextPaths[kind] = path;
  }

  const oldSections = current?.sections && typeof current.sections === "object" && !Array.isArray(current.sections)
    ? current.sections as Record<string, unknown>
    : {};
  const sections = { ...oldSections };
  if (parsed.data.about.trim()) sections.about = parsed.data.about.trim();
  else delete sections.about;

  const values = {
    singleton: true,
    logo_path: nextPaths.logo,
    hero_image_path: nextPaths.hero,
    primary_color: parsed.data.primary_color,
    font_key: parsed.data.font_key,
    sections: sections as Json,
    published: form.get("published") === "on",
  };

  const write = current
    ? await supabase.from("website_settings").update(values).eq("id", current.id).eq("updated_at", parsed.data.expected_updated_at).select("id").maybeSingle()
    : await supabase.from("website_settings").insert(values).select("id").maybeSingle();

  if (write.error || !write.data) {
    if (uploadedPaths.length) await supabase.storage.from("catalog-images").remove(uploadedPaths);
    return { error: "Appearance could not be saved. Refresh the page and try again." };
  }

  const pathsToRemove = [...new Set([
    oldPaths.logo && oldPaths.logo !== nextPaths.logo ? oldPaths.logo : null,
    oldPaths.hero && oldPaths.hero !== nextPaths.hero ? oldPaths.hero : null,
  ].filter((path): path is string => Boolean(path && appearancePath.test(path))))];
  let cleanupFailed = false;
  if (pathsToRemove.length) cleanupFailed = Boolean((await supabase.storage.from("catalog-images").remove(pathsToRemove)).error);

  revalidatePath("/admin/appearance");
  revalidatePath("/", "layout");
  if (values.published) {
    return { success: cleanupFailed ? "Appearance published. One replaced image needs storage cleanup." : "Appearance saved and published. Your public website is refreshing." };
  }
  return { success: cleanupFailed ? "Draft saved. One replaced image needs storage cleanup." : "Draft saved. Publish it whenever you are ready." };
}
