import "server-only";
import { createPrivilegedClient } from "@/lib/supabase/privileged.server";
import { formatBusinessTime } from "@/lib/time";
import { money } from "@/features/public-site/model";
import { sendTransactionalEmail } from "@/server/email/send-email";
import type { VerifiedProviderPayment } from "./provider";

export class PayMongoEventNotMatchedError extends Error {
  constructor() { super("PayMongo event did not match an expected payment."); this.name = "PayMongoEventNotMatchedError"; }
}

function html(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

async function emailConfirmedPayment(paymentId: string, amount: number, currency: string, appointmentId: string) {
  const supabase = createPrivilegedClient();
  const { data: appointment, error: appointmentError } = await supabase.from("appointments")
    .select("public_reference,starts_at,customer_id").eq("id", appointmentId).maybeSingle();
  if (appointmentError || !appointment) return;
  const [item, customer, settings] = await Promise.all([
    supabase.from("appointment_items").select("service_name_snapshot").eq("appointment_id", appointmentId).maybeSingle(),
    supabase.from("customers").select("email").eq("id", appointment.customer_id).maybeSingle(),
    supabase.from("business_settings").select("timezone").maybeSingle(),
  ]);
  const recipient = customer.data?.email?.trim();
  if (item.error || customer.error || settings.error || !recipient || !item.data) return;
  const reference = appointment.public_reference;
  const service = item.data.service_name_snapshot;
  const time = formatBusinessTime(appointment.starts_at, settings.data?.timezone ?? "UTC");
  const paid = money(amount, currency);
  const text = `Your appointment is confirmed.\n\nBooking reference: ${reference}\nService: ${service}\nAppointment: ${time}\nAmount paid: ${paid}\nStatus: Confirmed`;
  await sendTransactionalEmail({
    kind: "booking.confirmed",
    to: recipient,
    subject: "Your appointment payment is confirmed",
    text,
    html: `<p>Your appointment is confirmed.</p><dl><dt>Booking reference</dt><dd>${html(reference)}</dd><dt>Service</dt><dd>${html(service)}</dd><dt>Appointment</dt><dd>${html(time)}</dd><dt>Amount paid</dt><dd>${html(paid)}</dd><dt>Status</dt><dd>Confirmed</dd></dl>`,
    idempotencyKey: `payment_confirmed_${paymentId}`,
  }).catch(() => undefined);
}

/** Called only with signature-verified, test-mode PayMongo facts. */
export async function settlePayMongoPayment(facts: VerifiedProviderPayment) {
  const supabase = createPrivilegedClient();
  const { data: payment, error: lookupError } = await supabase.from("payments")
    .select("id,appointment_id,provider,provider_reference,amount,currency")
    .eq("provider", "paymongo").eq("provider_reference", facts.reference).maybeSingle();
  if (lookupError || !payment) throw new PayMongoEventNotMatchedError();
  if (payment.provider !== "paymongo" || payment.provider_reference !== facts.reference
    || payment.amount !== facts.amountMinor || payment.currency !== facts.currency) {
    throw new PayMongoEventNotMatchedError();
  }

  const { data: result, error } = await supabase.rpc("record_verified_payment", {
    p_payment: payment.id,
    p_event_id: facts.eventId,
    p_paid_at: facts.paidAt,
  });
  if (error || typeof result !== "string") throw new Error("Verified payment could not be recorded.");
  if (result === "CONFIRMED") await emailConfirmedPayment(payment.id, payment.amount, payment.currency, payment.appointment_id);
  return result;
}
