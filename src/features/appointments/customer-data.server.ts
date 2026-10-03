import "server-only";
import { notFound, redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/access.server";
import type { Database } from "@/types/database.generated";
type AppointmentRow=Database["public"]["Tables"]["appointments"]["Row"];
export type CustomerAppointmentView=Pick<AppointmentRow,"id"|"public_reference"|"state"|"starts_at"|"ends_at"|"currency"|"total_amount"|"payment_mode_snapshot"|"required_payment_amount"|"payment_due_at"|"payment_expired_at"> & {service_name:string;duration_minutes:number;staff_name:string;payment_status:string|null};
export async function readCustomerAppointments(){
 const {supabase,principal}=await requireArea("account");
 const {data:customer,error:customerError}=await supabase.from("customers").select("id").eq("auth_user_id",principal.userId).maybeSingle();
 if(customerError)throw new Error("Unable to load your customer profile.");if(!customer)redirect("/account/setup");
 const {data:appointments,error}=await supabase.from("appointments").select("id,public_reference,state,starts_at,ends_at,currency,total_amount,payment_mode_snapshot,required_payment_amount,payment_due_at,customer_id,staff_id,created_at,updated_at,accepted_by,accepted_at,declined_by,declined_at,decline_reason,cancelled_at,cancellation_reason,buffer_before_minutes,buffer_after_minutes,occupied_range,policy_version_id,request_key,payment_expired_at").eq("customer_id",customer.id).order("starts_at",{ascending:false}).limit(100);
 if(error)throw new Error("Unable to load your appointments.");if(!appointments?.length)return {appointments:[] as CustomerAppointmentView[],customerId:customer.id};
 const ids=appointments.map(a=>a.id),staffIds=[...new Set(appointments.map(a=>a.staff_id))];
 const [itemsResult,staffResult,paymentsResult]=await Promise.all([
  supabase.from("appointment_items").select("appointment_id,service_name_snapshot,duration_minutes").in("appointment_id",ids),
  supabase.from("staff").select("id,display_name").in("id",staffIds),
  supabase.from("payments").select("appointment_id,state").in("appointment_id",ids),
 ]);
 if(itemsResult.error||staffResult.error||paymentsResult.error)throw new Error("Unable to load appointment details.");
 const items=new Map((itemsResult.data??[]).map(x=>[x.appointment_id,x])),staff=new Map((staffResult.data??[]).map(x=>[x.id,x.display_name])),payments=new Map((paymentsResult.data??[]).map(x=>[x.appointment_id,x.state]));
 return {customerId:customer.id,appointments:appointments.map(a=>({id:a.id,public_reference:a.public_reference,state:a.state,starts_at:a.starts_at,ends_at:a.ends_at,currency:a.currency,total_amount:a.total_amount,payment_mode_snapshot:a.payment_mode_snapshot,required_payment_amount:a.required_payment_amount,payment_due_at:a.payment_due_at,payment_expired_at:a.payment_expired_at,service_name:items.get(a.id)?.service_name_snapshot??"Appointment",duration_minutes:items.get(a.id)?.duration_minutes??0,staff_name:staff.get(a.staff_id)??"Team member",payment_status:payments.get(a.id)??null})) satisfies CustomerAppointmentView[]};
}
export async function readCustomerAppointment(id:string){const result=await readCustomerAppointments();const appointment=result.appointments.find(x=>x.id===id);if(!appointment)notFound();return appointment}
