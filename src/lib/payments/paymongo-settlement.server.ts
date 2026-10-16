import "server-only";
import { createPrivilegedClient } from "@/lib/supabase/privileged.server";
import type { VerifiedProviderPayment } from "./provider";

export class PayMongoEventNotMatchedError extends Error {
  constructor() { super("PayMongo event did not match an expected payment."); this.name = "PayMongoEventNotMatchedError"; }
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
  return result;
}
