import "server-only";
import { z } from "zod";
import { siteUrl } from "@/lib/auth/site-url.server";
import type { AcceptedPaymentRequest, PaymentProvider, ProviderWebhookResult, VerifiedProviderPayment } from "./provider";
import { buildCheckoutSessionBody, isTestSecretKey, parsePayMongoWebhook, paymongoTestApi, verifyPayMongoTestSignature } from "./paymongo-core";

export class PayMongoConfigurationError extends Error {
  constructor() { super("PayMongo test configuration is unavailable."); this.name = "PayMongoConfigurationError"; }
}

export class PayMongoWebhookVerificationError extends Error {
  constructor() { super("PayMongo webhook verification failed."); this.name = "PayMongoWebhookVerificationError"; }
}

type ProviderOptions = {
  apiKey?: string;
  webhookSecret?: string;
  fetcher?: typeof fetch;
  nodeEnvironment?: string;
  testModeEnabled?: boolean;
};

const checkoutResponse = z.object({
  data: z.object({
    id: z.string().regex(/^cs_[A-Za-z0-9_-]{3,190}$/),
    attributes: z.object({ checkout_url: z.url(), livemode: z.literal(false) }),
  }),
});

function safeCheckoutUrl(value: string) {
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname === "checkout.paymongo.com" && !url.username && !url.password;
}

export function isPayMongoTestConfigured() {
  const testModeEnabled = process.env.NODE_ENV !== "production" || process.env.PAYMONGO_TEST_MODE_ENABLED === "true";
  return testModeEnabled && isTestSecretKey(process.env.PAYMONGO_SECRET_KEY);
}

export function createPayMongoProvider(options: ProviderOptions = {}): PaymentProvider {
  const fetcher = options.fetcher ?? fetch;
  const environment = options.nodeEnvironment ?? process.env.NODE_ENV;
  const testModeEnabled = options.testModeEnabled ?? process.env.PAYMONGO_TEST_MODE_ENABLED === "true";
  const secretKey = () => {
    const value = options.apiKey ?? process.env.PAYMONGO_SECRET_KEY;
    if ((environment === "production" && !testModeEnabled) || !isTestSecretKey(value)) throw new PayMongoConfigurationError();
    return value!.trim();
  };

  async function requestJson(url: string, init: RequestInit, key = secretKey()): Promise<unknown> {
    try {
      const response = await fetcher(url, {
        ...init,
        headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`, ...init.headers },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error("PayMongo request failed.");
      return await response.json();
    } catch (error) {
      if (error instanceof PayMongoConfigurationError) throw error;
      throw new Error("PayMongo test request failed.");
    }
  }

  return {
    id: "paymongo",
    async createCheckout(request: AcceptedPaymentRequest) {
      const key = secretKey();
      if (!/^[0-9a-f-]{36}$/i.test(request.idempotencyKey)) throw new Error("Payment idempotency is unavailable.");
      const body = buildCheckoutSessionBody(request, siteUrl());
      const result = await requestJson(paymongoTestApi, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": request.idempotencyKey },
        body: JSON.stringify(body),
      }, key);
      const parsed = checkoutResponse.safeParse(result);
      if (!parsed.success || !safeCheckoutUrl(parsed.data.data.attributes.checkout_url)) {
        throw new Error("PayMongo returned an invalid test checkout.");
      }
      return { reference: parsed.data.data.id, url: parsed.data.data.attributes.checkout_url };
    },
    async getPaymentStatus(reference: string) {
      if (!/^cs_[A-Za-z0-9_-]{3,190}$/.test(reference)) throw new Error("Invalid PayMongo checkout reference.");
      const result = await requestJson(`${paymongoTestApi}/${encodeURIComponent(reference)}`, { method: "GET" });
      const parsed = checkoutResponse.safeParse(result);
      if (!parsed.success || parsed.data.data.attributes.livemode !== false) throw new Error("PayMongo test status is unavailable.");
      const value = result as { data: { id: string; attributes: { status?: string; payments?: Array<{ id?: string; attributes?: { status?: string; amount?: number; currency?: string; paid_at?: number } }> } } };
      const paid = value.data.attributes.payments?.filter((payment) => payment.attributes?.status === "paid") ?? [];
      if (paid.length === 1) {
        const payment = paid[0];
        const attrs = payment.attributes;
        if (!payment.id || !Number.isSafeInteger(attrs?.amount) || !attrs?.currency || !attrs.paid_at) throw new Error("PayMongo test status is invalid.");
        return {
          eventId: `checkout-status:${reference}:${payment.id}`,
          reference,
          paidAt: new Date(attrs.paid_at * 1000).toISOString(),
          amountMinor: attrs.amount!,
          currency: attrs.currency,
        } satisfies VerifiedProviderPayment;
      }
      return { state: value.data.attributes.status === "expired" ? "CANCELLED" : "PENDING" } as const;
    },
    async verifyWebhook(rawBody: Uint8Array, headers: Headers): Promise<ProviderWebhookResult> {
      const webhookSecret = options.webhookSecret ?? process.env.PAYMONGO_WEBHOOK_SECRET;
      if (!webhookSecret?.trim()) throw new PayMongoConfigurationError();
      if (!verifyPayMongoTestSignature(rawBody, headers.get("paymongo-signature"), webhookSecret)) {
        throw new PayMongoWebhookVerificationError();
      }
      let payload: unknown;
      try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody)); }
      catch { throw new PayMongoWebhookVerificationError(); }
      try { return parsePayMongoWebhook(payload); }
      catch { throw new PayMongoWebhookVerificationError(); }
    },
    async refundPayment(request) {
      void request;
      // PayMongo documents refunds only for live transactions. This test-only
      // integration deliberately does not enable refund creation.
      throw new Error("Refund operations are unavailable in the PayMongo test integration.");
    },
  };
}
