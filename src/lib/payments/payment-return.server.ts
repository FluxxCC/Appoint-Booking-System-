import "server-only";
import { z } from "zod";
import { readGuestBooking } from "@/features/public-site/booking-data.server";
import { readVerifiedUser } from "@/lib/auth/require-user.server";
import { createPrivilegedClient } from "@/lib/supabase/privileged.server";

export type PaymentReturnBooking = {
  id: string;
  publicReference: string;
  state: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  serviceName: string;
  staffName: string;
  currency: string;
  totalAmount: number;
  requiredPaymentAmount: number;
  paymentMode: string;
  paymentStatus: string | null;
  paymentException: boolean;
  accessKind: "guest" | "customer";
};

async function readPaymentState(appointmentId: string) {
  try {
    const privileged = createPrivilegedClient();
    const { data } = await privileged.from("payments").select("state,exception_reason")
      .eq("appointment_id", appointmentId).eq("provider", "paymongo")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    return { state: data?.state ?? null, exception: Boolean(data?.exception_reason) };
  } catch {
    return { state: null, exception: false };
  }
}

export async function readPaymentReturnBooking(appointmentId: string): Promise<PaymentReturnBooking | null> {
  if (!z.uuid().safeParse(appointmentId).success) return null;

  const guest = await readGuestBooking(appointmentId);
  if (guest) {
    const payment = await readPaymentState(appointmentId);
    return {
      id: appointmentId,
      publicReference: String(guest.reference ?? ""),
      state: String(guest.state ?? ""),
      startsAt: String(guest.starts_at ?? ""),
      endsAt: String(guest.ends_at ?? ""),
      timezone: String(guest.timezone ?? "UTC"),
      serviceName: String(guest.service_name ?? "Appointment"),
      staffName: String(guest.staff_name ?? "Team member"),
      currency: String(guest.currency ?? "PHP"),
      totalAmount: Number(guest.total_amount ?? 0),
      requiredPaymentAmount: Number(guest.required_payment_amount ?? 0),
      paymentMode: String(guest.payment_mode ?? ""),
      paymentStatus: payment.state,
      paymentException: payment.exception,
      accessKind: "guest",
    };
  }

  const { user, supabase } = await readVerifiedUser();
  if (!user) return null;
  const { data: customer, error: customerError } = await supabase.from("customers").select("id")
    .eq("auth_user_id", user.id).maybeSingle();
  if (customerError || !customer) return null;

  const { data: appointment, error: appointmentError } = await supabase.from("appointments")
    .select("id,public_reference,state,starts_at,ends_at,currency,total_amount,required_payment_amount,payment_mode_snapshot,staff_id")
    .eq("id", appointmentId).eq("customer_id", customer.id).maybeSingle();
  if (appointmentError || !appointment) return null;

  const [itemResult, staffResult, businessResult, payment] = await Promise.all([
    supabase.from("appointment_items").select("service_name_snapshot").eq("appointment_id", appointmentId).maybeSingle(),
    supabase.from("staff").select("display_name").eq("id", appointment.staff_id).maybeSingle(),
    supabase.from("business_settings").select("timezone").maybeSingle(),
    readPaymentState(appointmentId),
  ]);
  if (itemResult.error || staffResult.error || businessResult.error) return null;
  return {
    id: appointmentId,
    publicReference: appointment.public_reference,
    state: appointment.state,
    startsAt: appointment.starts_at,
    endsAt: appointment.ends_at,
    timezone: businessResult.data?.timezone ?? "UTC",
    serviceName: itemResult.data?.service_name_snapshot ?? "Appointment",
    staffName: staffResult.data?.display_name ?? "Team member",
    currency: appointment.currency,
    totalAmount: appointment.total_amount,
    requiredPaymentAmount: appointment.required_payment_amount,
    paymentMode: appointment.payment_mode_snapshot,
    paymentStatus: payment.state,
    paymentException: payment.exception,
    accessKind: "customer",
  };
}
