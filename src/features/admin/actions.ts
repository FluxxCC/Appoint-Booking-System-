"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireArea } from "@/lib/auth/access.server";
import type { FormState } from "@/features/auth/schemas";
import { settingsSchema,homeAreaSchema, hoursSchema, closureSchema, announcementSchema } from "./schemas";

function invalid(error: z.ZodError): FormState { return { error: error.issues.map(x=>`${x.path.join(".") || "Form"}: ${x.message}`).join(" ") }; }
function result(error: {code?:string;message:string}|null): FormState {
  if (error) {
    if (error.code === "40001") return { error: "Settings changed in another session. Reload this page before saving." };
    if (/Outside|Slot intersects/.test(error.message)) return { error: "This change conflicts with an active appointment. Resolve the affected reservations before changing the schedule." };
    if (/timezone or currency/.test(error.message)) return { error: "Timezone and currency cannot change after appointments exist. A controlled data migration is required." };
    if (/ambiguous local time/.test(error.message)) return { error: "That local time is skipped or repeated by daylight saving. Choose another time." };
    return { error: "The change could not be saved. Check the values and reload to verify your access before retrying." };
  }
  revalidatePath("/admin", "layout");
  return { success: "Changes saved." };
}
const string = (form: FormData, key: string) => form.get(key) ?? "";
const checked = (form: FormData, key: string) => form.get(key)==="on";
export async function saveSettings(_state: FormState, form: FormData): Promise<FormState> {
  const {supabase} = await requireArea("admin");
  const keys=["name","description","contact_email","contact_phone","address","timezone","currency","scheduling_interval_minutes","default_buffer_minutes","minimum_notice_minutes","maximum_advance_days","payment_window_minutes","terms","refund_policy","expected_updated_at"];
  const parsed=settingsSchema.safeParse({ ...Object.fromEntries(keys.map(k=>[k,string(form,k)])), require_staff_approval: true, guest_booking_enabled:checked(form,"guest_booking_enabled"),customer_registration_enabled:checked(form,"customer_registration_enabled") });
  if (!parsed.success) return invalid(parsed.error);
  const {error}=await supabase.rpc("admin_save_settings",{p_values:parsed.data});
  return result(error);
}
export async function saveHomeArea(_state:FormState,form:FormData):Promise<FormState>{
 const {supabase}=await requireArea("admin");
 const parsed=homeAreaSchema.safeParse({latitude:form.get("latitude")??"",longitude:form.get("longitude")??"",radius:form.get("radius")??""});
 if(!parsed.success)return invalid(parsed.error);
 const {error}=await supabase.rpc("admin_save_home_area",{p_latitude:parsed.data.latitude,p_longitude:parsed.data.longitude,p_radius_km:parsed.data.radius});
 if(error)return {error:error.message.includes("map pin")?"Set a business map pin before enabling radius enforcement.":"Home Service area could not be saved. Verify the coordinates and radius."};
  revalidatePath("/admin","layout");revalidatePath("/","page");revalidatePath("/book","page");
 return {success:"Home Service area saved."};
}
export async function saveApprovalMode(_state: FormState, form: FormData): Promise<FormState> {
  const {supabase}=await requireArea("admin");
  const parsed=z.enum(["ADMIN_APPROVAL","STAFF_APPROVAL","AUTO_CONFIRM"]).safeParse(form.get("mode"));
  if(!parsed.success)return {error:"Choose a booking approval mode."};
  const {error}=await supabase.rpc("set_booking_approval_mode",{p_mode:parsed.data});
  if(error)return {error:"The approval mode could not be saved. Reload and verify your access."};
  revalidatePath("/admin/settings");
  revalidatePath("/admin/appointments");
  revalidatePath("/staff");
  return {success:"Booking approval mode saved."};
}
export async function saveHours(_state: FormState, form: FormData): Promise<FormState> {
  const {supabase}=await requireArea("admin");
  let input:unknown;
  try { const raw=string(form,"intervals"); if (typeof raw!=="string" || raw.length>10000) return {error:"Invalid hours."}; input=JSON.parse(raw); } catch { return {error:"Invalid hours."}; }
  const parsed=hoursSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const {error}=await supabase.rpc("admin_save_hours",{p_intervals:parsed.data}); return result(error);
}
export async function saveClosure(_state: FormState, form: FormData): Promise<FormState> {
  const {supabase}=await requireArea("admin");
  const parsed=closureSchema.safeParse({date:string(form,"date"),full_day:checked(form,"full_day"),start:string(form,"start"),end:string(form,"end"),reason:string(form,"reason")});
  if (!parsed.success) return invalid(parsed.error);
  const v=parsed.data;
  const {error}=await supabase.rpc("admin_save_closure",{p_date:v.date,p_full_day:v.full_day,p_start:v.full_day?"00:00":v.start,p_end:v.full_day?"00:00":v.end,p_reason:v.reason});
  return result(error);
}
export async function saveAnnouncement(_state: FormState, form: FormData): Promise<FormState> {
  const {supabase}=await requireArea("admin");
  const parsed=announcementSchema.safeParse({id:string(form,"id"),title:string(form,"title"),body:string(form,"body"),published:checked(form,"published"),start:string(form,"start"),end:string(form,"end")});
  if (!parsed.success) return invalid(parsed.error);
  const v=parsed.data;
  const args = {p_id:v.id||null,p_title:v.title,p_body:v.body,p_published:v.published,p_start:v.start||null,p_end:v.end||null};
  const {error}=await supabase.rpc("admin_save_announcement",args);
  return result(error);
}
export async function deleteClosure(_state: FormState, form: FormData): Promise<FormState> {
  const {supabase}=await requireArea("admin");
  const id=z.uuid().safeParse(form.get("id")); if (!id.success) return {error:"Invalid closure."};
  const {error,data}=await supabase.from("business_closures").delete().eq("id",id.data).select("id");
  return result(error ?? (data?.length ? null : {message:"Not found"}));
}
export async function deleteAnnouncement(_state: FormState, form: FormData): Promise<FormState> {
  const {supabase}=await requireArea("admin");
  const id=z.uuid().safeParse(form.get("id")); if (!id.success) return {error:"Invalid announcement."};
  const {error,data}=await supabase.from("announcements").delete().eq("id",id.data).select("id");
  return result(error ?? (data?.length ? null : {message:"Not found"}));
}
