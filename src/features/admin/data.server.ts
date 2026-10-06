import "server-only";
import { z } from "zod";
import { requireArea } from "@/lib/auth/access.server";
import { filtersSchema } from "./schemas";
import type { AdminData, Appointment } from "./types";
import { deriveHomeServiceStatus } from "./home-service-status";

export type SearchParams = Record<string,string|string[]|undefined>;
const customerDirectoryFiltersSchema = z.object({
  kind: z.enum(["accounts", "guests"]).default("accounts"),
  q: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
export async function readCustomerDirectory(search: SearchParams = {}) {
  const parsed = customerDirectoryFiltersSchema.safeParse({ kind: search.kind, q: search.q, page: search.page });
  if (!parsed.success) throw new Error("Invalid customer directory filters. Clear the filters and try again.");
  const { supabase } = await requireArea("admin");
  const { data, error } = await supabase.rpc("admin_customer_directory", {
    p_kind: parsed.data.kind,
    p_query: parsed.data.q,
    p_page: parsed.data.page,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Customer records could not be loaded. Apply the customer directory migration and try again.");
  }
  return {
    data: data as unknown as { customers: NonNullable<AdminData["customers"]>; total: number; page: number; timezone: string },
    filters: parsed.data,
  };
}

/** Read the complete service list through the existing MFA-protected admin catalog RPC. */
export async function readHomeServiceStatus(supabase: Awaited<ReturnType<typeof requireArea>>["supabase"]) {
  const services: { active: boolean; published: boolean; supports_home_service: boolean; category_id?: string | null }[] = [];
  let categories: { id: string; active: boolean; published: boolean }[] = [];
  let business: AdminData["business"] = null;
  let total = 0;
  for (let page = 1; page <= 10000; page += 1) {
    const { data, error } = await supabase.rpc("catalog_data", { p_kind: "services", p_page: page });
    if (error || !data || typeof data !== "object" || Array.isArray(data)) throw new Error("Home Service status could not be loaded.");
    const result = data as unknown as { business: AdminData["business"]; total: number; services: typeof services; categories: typeof categories };
    business = result.business;
    total = result.total;
    categories = result.categories ?? [];
    services.push(...(result.services ?? []));
    if (services.length >= total || !result.services?.length) break;
  }
  return deriveHomeServiceStatus(business, services, categories);
}

export async function readAdmin(section: "dashboard"|"settings"|"closures"|"announcements"|"appointments"|"appointment"|"calendar"|"customers"|"customer"|"payments"|"reports", search: SearchParams = {}, id?: string) {
  const { supabase } = await requireArea("admin");
  const parsed = filtersSchema.safeParse({ q: search.q, status: search.status, date: search.date, page: search.page });
  if (!parsed.success) throw new Error("Invalid search filters. Clear the filters and try again.");
  const filters = parsed.data;
  const { data, error } = await supabase.rpc("admin_data", { p_section: section, p_id: id ? z.uuid().parse(id) : undefined, p_date: filters.date || undefined, p_status: filters.status, p_query: filters.q, p_page: filters.page });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) throw new Error("Business information could not be loaded. Please try again.");
  const adminData = data as unknown as AdminData;
  if (section === "payments" && adminData.payments?.length) {
    const payments = adminData.payments;
    const paymentIds = payments.map((payment) => payment.id);
    const appointmentIds = [...new Set(payments.flatMap((payment) => payment.appointment_id ? [payment.appointment_id] : []))];
    const [{ data: references, error: referenceError }, { data: appointments, error: appointmentError }] = await Promise.all([
      supabase.from("payments").select("id,provider_reference").in("id", paymentIds),
      supabase.from("appointments").select("id,public_reference,customer_id,state").in("id", appointmentIds),
    ]);
    if (referenceError || appointmentError) throw new Error("Payment references could not be loaded. Please try again.");
    const customerIds = [...new Set((appointments ?? []).map((appointment) => appointment.customer_id))];
    const { data: customers, error: customerError } = customerIds.length
      ? await supabase.from("customers").select("id,auth_user_id").in("id", customerIds)
      : { data: [], error: null };
    if (customerError) throw new Error("Payment customer details could not be loaded. Please try again.");
    const referenceByPayment = new Map((references ?? []).map((payment) => [payment.id, payment.provider_reference]));
    const appointmentById = new Map((appointments ?? []).map((appointment) => [appointment.id, appointment]));
    const customerById = new Map((customers ?? []).map((customer) => [customer.id, customer]));
    adminData.payments = payments.map((payment) => {
      const appointment = payment.appointment_id ? appointmentById.get(payment.appointment_id) : undefined;
      const customer = appointment ? customerById.get(appointment.customer_id) : undefined;
      return {
        ...payment,
        provider_reference: referenceByPayment.get(payment.id) ?? null,
        public_reference: appointment?.public_reference,
        appointment_state: appointment?.state,
        customer_kind: customer?.auth_user_id ? "Customer" : "Guest",
      };
    });
  }
  if(["appointments","appointment","calendar","dashboard","customer"].includes(section)){
    const lists=[adminData.appointments,adminData.schedule,adminData.pending,adminData.upcoming].filter((x):x is Appointment[]=>Array.isArray(x));
    const rows=lists.flat();const ids=[...new Set(rows.map(row=>row.id))];
    if(ids.length){
      const {data:locations,error:locationError}=await supabase.from("appointment_home_locations").select("appointment_id,address,latitude,longitude,landmark,instructions").in("appointment_id",ids);
      if(locationError)throw new Error("Appointment destination details could not be loaded.");
      const map=new Map((locations??[]).map(location=>[location.appointment_id,{address:location.address,latitude:Number(location.latitude),longitude:Number(location.longitude),landmark:location.landmark,instructions:location.instructions}]));
      for(const list of lists)for(let i=0;i<list.length;i++)list[i]={...list[i],home_location:map.get(list[i].id)??null};
    }
  }
  return { data: adminData, filters, supabase };
}
