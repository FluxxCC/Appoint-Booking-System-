"use server";
import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { readVerifiedUser } from "@/lib/auth/require-user.server";
import { getAccess } from "@/lib/auth/access.server";
import { safeAppointmentDestination } from "@/lib/auth/access";
import { hasVerifiedCustomerAccount } from "@/features/auth/has-customer-account.server";
import { createPrivilegedClient } from "@/lib/supabase/privileged.server";
import { createClient } from "@/lib/supabase/server";
import { consumeRateLimit, trustedClientIdentifier } from "@/features/availability/rate-limit.server";

const schema=z.object({branchSlug:z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),serviceId:z.uuid(),staffId:z.union([z.literal(""),z.uuid()]),startsAt:z.iso.datetime({offset:true}),requestKey:z.uuid(),fullName:z.string().trim().min(2).max(200),email:z.union([z.literal(""),z.email().max(254)]),phone:z.string().trim().regex(/^$|^\+?[0-9 ()-]{7,25}$/).max(25),fulfillmentMode:z.enum(["BUSINESS_LOCATION","HOME_SERVICE"]),address:z.string().trim().max(500).default(""),latitude:z.string().default(""),longitude:z.string().default(""),landmark:z.string().trim().max(200).default(""),instructions:z.string().trim().max(1000).default(""),areaHint:z.string().trim().max(120).default("")});
export type BookingFormState={error?:string};

export async function signOutForGuestBookingAction(form: FormData): Promise<void> {
  const params = new URLSearchParams();
  for (const key of ["branch", "service", "staff"] as const) {
    const value = form.get(key);
    if (typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) params.set(key, value);
  }
  if (form.get("home") === "1") params.set("home", "1");

  // This is a device-level choice for guest booking. Keep other active sessions
  // on the customer's devices intact.
  const { error } = await (await createClient()).auth.signOut({ scope: "local" });
  if (error) redirect("/auth/error?reason=logout");
  revalidatePath("/", "layout");
  redirect(`/book${params.size ? `?${params}` : ""}`);
}

export async function signOutToCustomerAccountAction(form: FormData): Promise<void> {
 const destination=form.get("destination")==="register"?"/register":"/login";
 const next=safeAppointmentDestination(String(form.get("next")??""));
 const {error}=await (await createClient()).auth.signOut({scope:"global"});
 if(error)redirect("/auth/error?reason=logout");
 revalidatePath("/","layout");
 redirect(`${destination}${next?`?next=${encodeURIComponent(next)}`:""}`);
}

export async function submitBookingAction(_previous:BookingFormState,form:FormData):Promise<BookingFormState>{
 const requestHeaders=await headers();
 const decision=await consumeRateLimit("booking",trustedClientIdentifier(requestHeaders));
 if(!decision.allowed)return {error:decision.unavailable?"Booking is temporarily unavailable. Please try again shortly.":"Too many requests. Please wait a moment and try again."};
 const parsed=schema.safeParse({branchSlug:form.get("branchSlug"),serviceId:form.get("serviceId"),staffId:form.get("staffId")??"",startsAt:form.get("startsAt"),requestKey:form.get("requestKey"),fullName:form.get("fullName"),email:form.get("email")??"",phone:form.get("phone")??"",fulfillmentMode:form.get("fulfillmentMode")??"BUSINESS_LOCATION",address:form.get("address")??"",latitude:form.get("latitude")??"",longitude:form.get("longitude")??"",landmark:form.get("landmark")??"",instructions:form.get("instructions")??"",areaHint:form.get("areaHint")??""});
 if(!parsed.success)return {error:"Check the highlighted booking details and try again."};
 const {user}=await readVerifiedUser();
 if(form.get("fulfillmentMode")==="HOME_SERVICE"&&!user)return {error:"Sign in or create a customer account to book Home Service."};
 if(form.get("fulfillmentMode")==="HOME_SERVICE"){
  const access=await getAccess().catch(()=>null);
  if(!await hasVerifiedCustomerAccount(access?.supabase,access?.principal))return {error:"A verified customer account is required for Home Service."};
 }
 let supabase;
 try { supabase=createPrivilegedClient(); }
 catch { return {error:"Booking is temporarily unavailable. Please try again shortly."}; }
 const value=parsed.data;
 const homeSchema=z.object({address:z.string().trim().min(5).max(500),latitude:z.coerce.number().finite().min(-90).max(90),longitude:z.coerce.number().finite().min(-180).max(180),landmark:z.string().trim().max(200),instructions:z.string().trim().max(1000),areaHint:z.string().trim().min(2).max(120)});
 const destination=value.fulfillmentMode==="HOME_SERVICE"?homeSchema.safeParse(value):null;
 if(destination&&!destination.success)return {error:"Enter a service address and confirm a valid map location."};
 const {data,error}=await supabase.rpc("server_public_branch_booking_submit",{
  p_branch_slug:value.branchSlug,p_service:value.serviceId,p_staff:value.staffId||null,p_start:value.startsAt,p_request_key:value.requestKey,
  p_name:value.fullName,p_email:value.email||null,p_phone:value.phone||null,p_auth_user:user?.id??null,p_fulfillment:value.fulfillmentMode,
  p_address:destination?.success?destination.data.address:null,p_latitude:destination?.success?destination.data.latitude:null,
  p_longitude:destination?.success?destination.data.longitude:null,p_landmark:destination?.success?(destination.data.landmark||null):null,
  p_instructions:destination?.success?(destination.data.instructions||null):null,p_area_hint:destination?.success?destination.data.areaHint:null,
 });
 if(error||!data){
  const message=error?.message??"";
  if(/guest booking is disabled/i.test(message))return {error:"Guest booking is currently unavailable. Please sign in to request an appointment."};
  if(/profile|account email/i.test(message))return {error:"Complete your customer profile and verify your email before booking."};
  if(/outside the current home service area/i.test(message))return {error:"This location is outside the selected branch’s Home Service area."};
  if(/home service|service destination|coordinates|radius|travel time/i.test(message))return {error:"We could not validate this Home Service destination or time. Check the address and choose another time if needed."};
  if(/available|schedule|booking window|slot|ambiguous|closed|service|staff/i.test(message))return {error:"That appointment time is no longer available or does not meet the booking rules. Choose another time."};
  return {error:"We could not submit the request. Please review your details and try again."};
 }
 const booking=data as {appointment_id?:unknown;guest_token?:unknown;branch_slug?:unknown};
 if(typeof booking.appointment_id!=="string")return {error:"We could not confirm the request. Please try again."};
 if(!user){
  if(typeof booking.guest_token!=="string"||!/^[A-Za-z0-9_-]{40,60}$/.test(booking.guest_token))return {error:"This request was already received. A retry does not create new guest access; reopen the original confirmation page in the browser where you submitted it."};
  const store=await cookies();
  store.set(`guest_booking_${booking.appointment_id}`,booking.guest_token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:60*60*24*30});
 }
 const branchSlug=typeof booking.branch_slug==="string"?booking.branch_slug:value.branchSlug;
 if(user)redirect(`/account/appointments/${encodeURIComponent(booking.appointment_id)}`);
 redirect(`/book/confirmation?id=${encodeURIComponent(booking.appointment_id)}&branch=${encodeURIComponent(branchSlug)}`);
}
