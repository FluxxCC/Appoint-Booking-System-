import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
export async function readGuestBooking(appointmentId:string){
 if(!/^[0-9a-f-]{36}$/i.test(appointmentId))return null;
 const token=(await cookies()).get(`guest_booking_${appointmentId}`)?.value;
 if(!token||!/^[A-Za-z0-9_-]{40,60}$/.test(token))return null;
 const supabase=await createClient(),hash=createHash("sha256").update(token).digest("hex");
 const {data,error}=await supabase.rpc("guest_appointment_by_token",{p_token_hash:hash,p_appointment:appointmentId});
 return error||!data?null:data as Record<string,unknown>;
}
