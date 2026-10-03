import "server-only";
import { z } from "zod";
import { requireArea } from "@/lib/auth/access.server";
import { filtersSchema } from "./schemas";
import type { AdminData } from "./types";

export type SearchParams = Record<string,string|string[]|undefined>;
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
  return { data: adminData, filters, supabase };
}
