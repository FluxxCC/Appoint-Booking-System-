import "server-only";
import { notFound, redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/access.server";
import { provisionVerifiedCustomer } from "@/features/auth/provision-customer.server";
import type { Database } from "@/types/database.generated";
type AppointmentRow=Database["public"]["Tables"]["appointments"]["Row"];
export type CustomerAppointmentView=Pick<AppointmentRow,"id"|"public_reference"|"state"|"starts_at"|"ends_at"|"currency"|"total_amount"|"payment_mode_snapshot"|"required_payment_amount"|"payment_due_at"|"payment_expired_at"|"fulfillment_mode"|"home_service_fee_snapshot"> & {service_name:string;duration_minutes:number;staff_name:string;payment_status:string|null;home_location?:{address:string;latitude:number;longitude:number;landmark:string|null;instructions:string|null}|null};
export async function readCustomerAppointments(){
 const {supabase,principal}=await requireArea("account");
 let {data:customer,error:customerError}=await supabase.from("customers").select("id,display_name").eq("auth_user_id",principal.userId).maybeSingle();
 if(customerError)throw new Error("Unable to load your customer profile.");
 if(!customer||!customer.display_name?.trim()||customer.display_name.trim().length<2){
  await provisionVerifiedCustomer(supabase);
  const refreshed=await supabase.from("customers").select("id,display_name").eq("auth_user_id",principal.userId).maybeSingle();
  customer=refreshed.data;customerError=refreshed.error;
 }
 if(customerError)throw new Error("Unable to load your customer profile.");if(!customer)redirect("/account/setup");
 const {data:appointments,error}=await supabase.from("appointments").select("id,public_reference,state,starts_at,ends_at,currency,total_amount,payment_mode_snapshot,required_payment_amount,payment_due_at,customer_id,staff_id,created_at,updated_at,accepted_by,accepted_at,declined_by,declined_at,decline_reason,cancelled_at,cancellation_reason,buffer_before_minutes,buffer_after_minutes,occupied_range,policy_version_id,request_key,payment_expired_at,fulfillment_mode,home_service_fee_snapshot").eq("customer_id",customer.id).order("starts_at",{ascending:false}).limit(100);
 if(error)throw new Error("Unable to load your appointments.");if(!appointments?.length)return {appointments:[] as CustomerAppointmentView[],customerId:customer.id};
 const ids=appointments.map(a=>a.id),staffIds=[...new Set(appointments.map(a=>a.staff_id))];
 const [itemsResult,staffResult,paymentsResult,locationsResult]=await Promise.all([
  supabase.from("appointment_items").select("appointment_id,service_name_snapshot,duration_minutes").in("appointment_id",ids),
  supabase.from("staff").select("id,display_name").in("id",staffIds),
  supabase.from("payments").select("appointment_id,state").in("appointment_id",ids),
  supabase.from("appointment_home_locations").select("appointment_id,address,latitude,longitude,landmark,instructions").in("appointment_id",ids),
 ]);
 if(itemsResult.error||staffResult.error||paymentsResult.error||locationsResult.error)throw new Error("Unable to load appointment details.");
 const items=new Map((itemsResult.data??[]).map(x=>[x.appointment_id,x])),staff=new Map((staffResult.data??[]).map(x=>[x.id,x.display_name])),payments=new Map((paymentsResult.data??[]).map(x=>[x.appointment_id,x.state]));
 const locations=new Map((locationsResult.data??[]).map(x=>[x.appointment_id,{address:x.address,latitude:Number(x.latitude),longitude:Number(x.longitude),landmark:x.landmark,instructions:x.instructions}]));
 return {customerId:customer.id,appointments:appointments.map(a=>({id:a.id,public_reference:a.public_reference,state:a.state,starts_at:a.starts_at,ends_at:a.ends_at,currency:a.currency,total_amount:a.total_amount,payment_mode_snapshot:a.payment_mode_snapshot,required_payment_amount:a.required_payment_amount,payment_due_at:a.payment_due_at,payment_expired_at:a.payment_expired_at,fulfillment_mode:a.fulfillment_mode,home_service_fee_snapshot:a.home_service_fee_snapshot,home_location:locations.get(a.id)??null,service_name:items.get(a.id)?.service_name_snapshot??"Appointment",duration_minutes:items.get(a.id)?.duration_minutes??0,staff_name:staff.get(a.staff_id)??"Team member",payment_status:payments.get(a.id)??null})) satisfies CustomerAppointmentView[]};
}
export async function readCustomerAppointment(id:string){const result=await readCustomerAppointments();const appointment=result.appointments.find(x=>x.id===id);if(!appointment)notFound();return appointment}
