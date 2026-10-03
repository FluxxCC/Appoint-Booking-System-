import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { AcceptedPaymentRequest, VerifiedProviderPayment } from "./provider";

export const paymongoTestApi = "https://api.paymongo.com/v2/checkout_sessions";
const signatureToleranceSeconds = 5 * 60;

export function isTestSecretKey(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().startsWith("sk_test_");
}

export function supportsPayMongoCurrency(currency: string): boolean {
  return currency === "PHP";
}

export function buildCheckoutSessionBody(request: AcceptedPaymentRequest, origin: string) {
  const site = new URL(origin);
  if (site.protocol !== "https:" && !(site.protocol === "http:" && ["localhost", "127.0.0.1"].includes(site.hostname))) {
    throw new Error("Payment return URL is not trusted.");
  }
  if (!Number.isSafeInteger(request.amountMinor) || request.amountMinor <= 0) {
    throw new Error("Invalid payment amount.");
  }
  // PayMongo's current Checkout Session API documents PHP as its supported currency.
  // The business currency is still passed through; unsupported currencies fail closed.
  if (!supportsPayMongoCurrency(request.currency)) throw new Error("PayMongo does not support this business currency.");
  const serviceName = request.serviceName.trim().slice(0, 120);
  const publicReference = request.publicReference.trim().slice(0, 80);
  if (!serviceName || !publicReference) throw new Error("Appointment details are unavailable.");

  const returnUrl = new URL("/payment/return", site);
  returnUrl.searchParams.set("result", "checking");
  const cancelUrl = new URL("/payment/return", site);
  cancelUrl.searchParams.set("result", "cancelled");

  return {
    data: {
      attributes: {
        line_items: [{
          name: serviceName,
          description: `Appointment ${publicReference}`,
          amount: request.amountMinor,
          currency: request.currency,
          quantity: 1,
        }],
        payment_method_types: ["card", "gcash", "qrph"],
        success_url: returnUrl.toString(),
        cancel_url: cancelUrl.toString(),
        reference_number: publicReference,
        send_email_receipt: false,
      },
    },
  };
}

export function verifyPayMongoTestSignature(
  rawBody: Uint8Array,
  signatureHeader: string | null,
  webhookSecret: string,
  nowMs = Date.now(),
): boolean {
  if (!signatureHeader || !webhookSecret.trim()) return false;
  const parts = new Map<string, string>();
  for (const part of signatureHeader.split(",")) {
    const separator = part.indexOf("=");
    if (separator <= 0) return false;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name || parts.has(name)) return false;
    parts.set(name, value);
  }
  const timestamp = parts.get("t");
  const signature = parts.get("te");
  if (!timestamp || !/^\d{1,12}$/.test(timestamp) || !signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(Math.floor(nowMs / 1000) - timestampSeconds) > signatureToleranceSeconds) return false;
  const expected = createHmac("sha256", webhookSecret).update(timestamp).update(".").update(rawBody).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(expected, received);
}

const record = z.record(z.string(), z.unknown());
const text = z.string().min(1).max(300);

function object(value: unknown): Record<string, unknown> | null {
  const parsed = record.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function readPaidAt(value: unknown, fallback: unknown): string | null {
  const candidate = value ?? fallback;
  if (typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate > 0) {
    const date = new Date(candidate * 1000);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  if (typeof candidate === "string" && candidate.length <= 50) {
    const date = new Date(candidate);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  return null;
}

/** Parses the documented v2 Hosted Checkout webhook only after its raw bytes verify. */
export function parsePayMongoWebhook(value: unknown): VerifiedProviderPayment | { ignored: true } {
  const root = object(value);
  const envelope = object(root?.data);
  const attributes = object(envelope?.attributes);
  const eventType = envelope?.type ?? attributes?.type;
  if (eventType !== "checkout_session.payment.paid") return { ignored: true };

  const liveMode = envelope?.livemode ?? attributes?.livemode;
  if (liveMode !== false) throw new Error("Unexpected PayMongo mode.");
  const resource = object(envelope?.data ?? attributes?.data);
  const resourceAttributes = object(resource?.attributes);
  const sessionId = text.safeParse(resource?.id);
  if (!sessionId.success || !sessionId.data.startsWith("cs_")) throw new Error("Invalid checkout session event.");
  if (resourceAttributes?.livemode !== undefined && resourceAttributes.livemode !== false) throw new Error("Unexpected PayMongo mode.");

  const intent = object(resourceAttributes?.payment_intent);
  const intentAttributes = object(intent?.attributes);
  const paymentList = resourceAttributes?.payments ?? intentAttributes?.payments;
  if (!Array.isArray(paymentList)) throw new Error("Checkout payment details are missing.");
  const paid = paymentList.filter((item) => object(object(item)?.attributes)?.status === "paid");
  if (paid.length !== 1) throw new Error("Checkout payment details are invalid.");
  const payment = object(paid[0]);
  const paymentAttributes = object(payment?.attributes);
  const paymentId = text.safeParse(payment?.id);
  const amount = z.number().int().positive().safeParse(paymentAttributes?.amount);
  const currency = z.string().regex(/^[A-Z]{3}$/).safeParse(paymentAttributes?.currency);
  const paidAt = readPaidAt(paymentAttributes?.paid_at, envelope?.created_at ?? attributes?.created_at);
  if (!paymentId.success || !paymentId.data.startsWith("pay_") || !amount.success || !currency.success || !paidAt) {
    throw new Error("Checkout payment details are invalid.");
  }
  if (paymentAttributes?.livemode !== undefined && paymentAttributes.livemode !== false) throw new Error("Unexpected PayMongo mode.");

  const eventId = text.safeParse(envelope?.id ?? root?.id);
  return {
    eventId: eventId.success ? eventId.data : `checkout_session.payment.paid:${sessionId.data}:${paymentId.data}`,
    reference: sessionId.data,
    paidAt,
    amountMinor: amount.data,
    currency: currency.data,
  };
}
