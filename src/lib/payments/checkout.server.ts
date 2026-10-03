import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { createPrivilegedClient } from "@/lib/supabase/privileged.server";
import { readVerifiedUser } from "@/lib/auth/require-user.server";
import type { PaymentProvider } from "./provider";

const preparedAttempt = z.object({
  payment_id: z.uuid(), appointment_id: z.uuid(), amount_minor: z.number().int().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/), idempotency_key: z.uuid(),
  provider_reference: z.string().nullable(), checkout_url: z.string().url().nullable(),
  payment_due_at: z.string().datetime({ offset: true }), reused: z.boolean(),
});
const attachedCheckout = z.object({
  payment_id: z.uuid(), provider_reference: z.string(), checkout_url: z.string().url(), reused: z.boolean(),
});

/**
 * Shared customer/guest checkout start. Call only from a trusted server route
 * after a real provider has been selected and configured. The browser supplies
 * only the appointment identifier; identity proof, amount, currency, deadline,
 * and idempotency are resolved on the server/database side.
 */
export async function startPaymentCheckout(appointmentId: string, provider: PaymentProvider) {
  const parsedAppointment = z.uuid().safeParse(appointmentId);
  if (!parsedAppointment.success || !/^[a-z0-9_-]{1,40}$/.test(provider.id)) {
    throw new Error("Payment checkout is unavailable.");
  }

  const { user, supabase } = await readVerifiedUser();
  let authUserId: string | null = null;
  let guestTokenHash: string | null = null;

  if (user) {
    const { data: customer } = await supabase.from("customers").select("id")
      .eq("auth_user_id", user.id).maybeSingle();
    if (customer) {
      const { data: ownedAppointment } = await supabase.from("appointments").select("id")
        .eq("id", parsedAppointment.data).eq("customer_id", customer.id).maybeSingle();
      if (ownedAppointment) authUserId = user.id;
    }
  }

  if (!authUserId) {
    const token = (await cookies()).get(`guest_booking_${parsedAppointment.data}`)?.value;
    if (token && /^[A-Za-z0-9_-]{40,60}$/.test(token)) {
      const candidateHash = createHash("sha256").update(token).digest("hex");
      const { data: guestContext, error } = await supabase.rpc("guest_appointment_by_token", {
        p_token_hash: candidateHash, p_appointment: parsedAppointment.data,
      });
      if (!error && guestContext) guestTokenHash = candidateHash;
    }
  }
  if (!authUserId && !guestTokenHash) throw new Error("Appointment access denied.");

  const privileged = createPrivilegedClient();
  const { data, error } = await privileged.rpc("prepare_payment_attempt", {
    p_appointment: parsedAppointment.data,
    p_auth_user: authUserId,
    p_guest_token_hash: guestTokenHash,
    p_provider: provider.id,
    p_idempotency_key: randomUUID(),
  });
  const attempt = preparedAttempt.safeParse(data);
  if (error || !attempt.success) throw new Error("Payment checkout could not be prepared.");
  if (attempt.data.appointment_id !== parsedAppointment.data) throw new Error("Payment checkout could not be prepared.");
  if (Boolean(attempt.data.provider_reference) !== Boolean(attempt.data.checkout_url)) {
    throw new Error("Payment checkout needs reconciliation.");
  }
  if (attempt.data.checkout_url) return { checkoutUrl: attempt.data.checkout_url, reused: true };

  const [bookingResult, itemResult] = await Promise.all([
    privileged.from("appointments").select("public_reference").eq("id", attempt.data.appointment_id).maybeSingle(),
    privileged.from("appointment_items").select("service_name_snapshot").eq("appointment_id", attempt.data.appointment_id).maybeSingle(),
  ]);
  if (bookingResult.error || itemResult.error || !bookingResult.data?.public_reference || !itemResult.data?.service_name_snapshot) {
    throw new Error("Appointment checkout details are unavailable.");
  }

  const checkout = await provider.createCheckout({
    appointmentId: attempt.data.appointment_id,
    amountMinor: attempt.data.amount_minor,
    currency: attempt.data.currency,
    deadline: attempt.data.payment_due_at,
    idempotencyKey: attempt.data.idempotency_key,
    serviceName: itemResult.data.service_name_snapshot,
    publicReference: bookingResult.data.public_reference,
  });
  const safeCheckout = z.object({ reference: z.string().min(1).max(200), url: z.string().url().refine(value => value.startsWith("https://")) }).safeParse(checkout);
  if (!safeCheckout.success) throw new Error("Payment provider returned an invalid checkout.");

  const { data: attached, error: attachError } = await privileged.rpc("attach_payment_checkout", {
    p_payment: attempt.data.payment_id,
    p_reference: safeCheckout.data.reference,
    p_checkout_url: safeCheckout.data.url,
  });
  const persistedCheckout = attachedCheckout.safeParse(attached);
  if (attachError || !persistedCheckout.success) throw new Error("Payment checkout could not be saved.");
  return { checkoutUrl: persistedCheckout.data.checkout_url, reused: attempt.data.reused };
}
