import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/config/env";
import type { PublicWebsite } from "./model";
export type { PublicService, PublicStaff, PublicWebsite } from "./model";

async function readPublicWebsiteUncached(): Promise<PublicWebsite> {
  const supabase = await createClient();
  const [{ data, error }, { data: bookingData, error: bookingError }] = await Promise.all([
    supabase.rpc("public_website_data"),
    supabase.rpc("public_booking_data", { p_branch_slug: null }),
  ]);
  if (error || bookingError) throw new Error("The public website could not be loaded.");
  if (!data) return { business:null,branches:[],services:[],staff:[],assignments:[],categories:[],hours:[],announcements:[],policy:null,refund_policy:null };
  const website = data as unknown as PublicWebsite;
  const booking = bookingData as unknown as Pick<PublicWebsite, "branches"> | null;
  return { ...website, branches: booking?.branches ?? [] };
}
export const readPublicWebsite = cache(readPublicWebsiteUncached);

/** Loads the public booking catalog for an eligible branch slug. The database
 * resolves and filters public branches; a browser never supplies a trusted ID. */
export async function readPublicBookingData(branchSlug?: string): Promise<PublicWebsite> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_booking_data", { p_branch_slug: branchSlug ?? null });
  if (error) throw new Error("The booking options could not be loaded.");
  if (!data) return { business:null,branch:null,branches:[],services:[],staff:[],assignments:[],categories:[],hours:[],announcements:[],policy:null,refund_policy:null };
  return data as unknown as PublicWebsite;
}

export function imageUrl(path: string | null | undefined) {
  if (!path) return null;
  const { url } = getSupabasePublicEnv();
  return `${url}/storage/v1/object/public/catalog-images/${path.split("/").map(encodeURIComponent).join("/")}`;
}


