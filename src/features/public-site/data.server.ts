import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/config/env";
import type { PublicWebsite } from "./model";
export type { PublicService, PublicStaff, PublicWebsite } from "./model";

export async function readPublicWebsite(): Promise<PublicWebsite> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_website_data");
  if (error) throw new Error("The public website could not be loaded.");
  if (!data) return { business:null,website:null,services:[],staff:[],assignments:[],categories:[],hours:[],announcements:[],policy:null,refund_policy:null };
  return data as unknown as PublicWebsite;
}

export function imageUrl(path: string | null | undefined) {
  if (!path) return null;
  const { url } = getSupabasePublicEnv();
  return `${url}/storage/v1/object/public/catalog-images/${path.split("/").map(encodeURIComponent).join("/")}`;
}


