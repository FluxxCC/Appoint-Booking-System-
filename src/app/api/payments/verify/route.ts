import "server-only";
import { z } from "zod";
import { consumeRateLimit, trustedClientIdentifier } from "@/features/availability/rate-limit.server";
import { createPrivilegedClient } from "@/lib/supabase/privileged.server";
import { siteUrl } from "@/lib/auth/site-url.server";
import { readPaymentReturnBooking } from "@/lib/payments/payment-return.server";
import { createPayMongoProvider, isPayMongoConfigured } from "@/lib/payments/paymongo.server";
import { settlePayMongoPayment } from "@/lib/payments/paymongo-settlement.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PublicPaymentStatus = "paid" | "review" | "pending" | "unavailable";

function json(status: PublicPaymentStatus, httpStatus = 200) {
  return Response.json({ status }, { status: httpStatus, headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (!origin || origin === "null" || origin !== siteUrl()) return json("unavailable", 403);
  } catch {
    return json("unavailable", 403);
  }

  const limit = await consumeRateLimit("paymentVerify", trustedClientIdentifier(request.headers));
  if (!limit.allowed) return json("unavailable", limit.unavailable ? 503 : 429);

  let body: unknown;
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 8_192) return json("unavailable", 413);
    body = await request.json();
  } catch {
    return json("unavailable", 400);
  }
  const parsed = z.object({ appointmentId: z.uuid() }).safeParse(body);
  if (!parsed.success) return json("unavailable", 400);

  const booking = await readPaymentReturnBooking(parsed.data.appointmentId);
  if (!booking) return json("unavailable", 404);

  try {
    const privileged = createPrivilegedClient();
    const { data: payment, error } = await privileged.from("payments")
      .select("id,state,provider_reference,exception_reason")
      .eq("appointment_id", booking.id).eq("provider", "paymongo")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return json("unavailable", 503);
    if (!payment) return json("pending");
    if (payment.state === "SUCCEEDED") {
      return json(payment.exception_reason || booking.state !== "CONFIRMED" ? "review" : "paid");
    }
    if (payment.state !== "PENDING" || !payment.provider_reference) return json("pending");
    if (!isPayMongoConfigured()) return json("unavailable", 503);

    const providerResult = await createPayMongoProvider().getPaymentStatus(payment.provider_reference);
    if ("state" in providerResult) return json("pending");
    const settlement = await settlePayMongoPayment(providerResult);
    if (settlement === "CONFIRMED") return json("paid");
    if (settlement === "LATE_PAYMENT_REVIEW") return json("review");
    return json("pending");
  } catch {
    return json("unavailable", 503);
  }
}
