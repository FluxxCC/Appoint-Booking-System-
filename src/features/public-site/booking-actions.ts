"use server";
import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { readVerifiedUser } from "@/lib/auth/require-user.server";
import { createPrivilegedClient } from "@/lib/supabase/privileged.server";
import { createClient } from "@/lib/supabase/server";
import { consumeRateLimit, trustedClientIdentifier } from "@/features/availability/rate-limit.server";
import { dispatchNotificationsAfterCommit } from "@/server/email/post-commit.server";

const schema=z.object({serviceId:z.uuid(),staffId:z.union([z.literal(""),z.uuid()]),startsAt:z.iso.datetime({offset:true}),requestKey:z.uuid(),fullName:z.string().trim().min(2).max(200),email:z.union([z.literal(""),z.email().max(254)]),phone:z.string().trim().regex(/^$|^\+?[0-9 ()-]{7,25}$/).max(25),fulfillmentMode:z.enum(["BUSINESS_LOCATION","HOME_SERVICE"]),address:z.string().trim().max(500).default(""),latitude:z.string().default(""),longitude:z.string().default(""),landmark:z.string().trim().max(200).default(""),instructions:z.string().trim().max(1000).default(""),areaHint:z.string().trim().max(120).default("")});
export type BookingFormState={error?:string};

export async function signOutForGuestBookingAction(): Promise<void> {
  const { error } = await (await createClient()).auth.signOut({ scope: "global" });
  if (error) redirect("/auth/error?reason=logout");
  revalidatePath("/", "layout");
  redirect("/book");
}

export async function submitBookingAction(_previous:BookingFormState,form:FormData):Promise<BookingFormState>{
 const requestHeaders=await headers();
 const decision=await consumeRateLimit("booking",trustedClientIdentifier(requestHeaders));
 if(!decision.allowed)return {error:decision.unavailable?"Booking is temporarily unavailable. Please try again shortly.":"Too many requests. Please wait a moment and try again."};
 const parsed=schema.safeParse({serviceId:form.get("serviceId"),staffId:form.get("staffId")??"",startsAt:form.get("startsAt"),requestKey:form.get("requestKey"),fullName:form.get("fullName"),email:form.get("email")??"",phone:form.get("phone")??"",fulfillmentMode:form.get("fulfillmentMode")??"BUSINESS_LOCATION",address:form.get("address")??"",latitude:form.get("latitude")??"",longitude:form.get("longitude")??"",landmark:form.get("landmark")??"",instructions:form.get("instructions")??"",areaHint:form.get("areaHint")??""});
 if(!parsed.success)return {error:"Check the highlighted booking details and try again."};
 const {user}=await readVerifiedUser();
 let supabase;
 try { supabase=createPrivilegedClient(); }
 catch { return {error:"Booking is temporarily unavailable. Please try again shortly."}; }
 const value=parsed.data;
 if(value.fulfillmentMode==="HOME_SERVICE"&&!user)return {error:"Sign in or create an account to book a Home Service appointment."};
 const homeSchema=z.object({address:z.string().trim().min(5).max(500),latitude:z.coerce.number().finite().min(-90).max(90),longitude:z.coerce.number().finite().min(-180).max(180),landmark:z.string().trim().max(200),instructions:z.string().trim().max(1000),areaHint:z.string().trim().min(2).max(120)});
 const destination=value.fulfillmentMode==="HOME_SERVICE"?homeSchema.safeParse(value):null;
 if(destination&&!destination.success)return {error:"Enter a service address and confirm a valid map location."};
 const {data,error}=value.fulfillmentMode==="HOME_SERVICE"
  ?await supabase.rpc("server_home_service_booking_submit",{
   p_service:value.serviceId,p_staff:value.staffId||null,p_start:value.startsAt,p_request_key:value.requestKey,
   p_name:value.fullName,p_email:value.email||null,p_phone:value.phone||null,p_auth_user:user?.id??null,
   p_address:destination!.data.address,p_latitude:destination!.data.latitude,p_longitude:destination!.data.longitude,
   p_landmark:destination!.data.landmark||null,p_instructions:destination!.data.instructions||null,p_area_hint:destination!.data.areaHint,
  })
  :await supabase.rpc("server_public_booking_submit",{
  p_service:value.serviceId,p_staff:value.staffId||null,p_start:value.startsAt,p_request_key:value.requestKey,
  p_name:value.fullName,p_email:value.email||null,p_phone:value.phone||null,p_auth_user:user?.id??null,
 });
 if(error||!data){
  const message=error?.message??"";
  if(/guest booking is disabled/i.test(message))return {error:"Guest booking is currently unavailable. Please sign in to request an appointment."};
  if(/profile|account email/i.test(message))return {error:"Complete your customer profile and verify your email before booking."};
  if(/outside the current home service area/i.test(message))return {error:"This location is outside the current Home Service area."};
  if(/home service|service destination|coordinates|radius|travel time/i.test(message))return {error:"We could not validate this Home Service destination or time. Check the address and choose another time if needed."};
  if(/available|schedule|booking window|slot|ambiguous|closed|service|staff/i.test(message))return {error:"That appointment time is no longer available or does not meet the booking rules. Choose another time."};
  return {error:"We could not submit the request. Please review your details and try again."};
 }
 const booking=data as {appointment_id?:unknown;guest_token?:unknown};
 if(typeof booking.appointment_id!=="string")return {error:"We could not confirm the request. Please try again."};
 await dispatchNotificationsAfterCommit({ appointmentId: booking.appointment_id });
 if(!user){
  if(typeof booking.guest_token!=="string"||!/^[A-Za-z0-9_-]{40,60}$/.test(booking.guest_token))return {error:"This request was already received. A retry does not create new guest access; reopen the original confirmation page in the browser where you submitted it."};
  const store=await cookies();
  store.set(`guest_booking_${booking.appointment_id}`,booking.guest_token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:60*60*24*30});
  store.set(`guest_booking_email_${booking.appointment_id}`,"queued",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:60*10});
 }
 if(user)redirect(`/account/appointments/${encodeURIComponent(booking.appointment_id)}`);
 redirect(`/book/confirmation?id=${encodeURIComponent(booking.appointment_id)}`);
}
