import "server-only";
import { z } from "zod";
import { siteUrl } from "@/lib/auth/site-url.server";
import type { AcceptedPaymentRequest, PaymentProvider, ProviderWebhookResult, VerifiedProviderPayment } from "./provider";
import { buildCheckoutSessionBody, modeForSecretKey, parsePayMongoWebhook, paymongoApi, verifyPayMongoSignature, type PayMongoMode } from "./paymongo-core";

export class PayMongoConfigurationError extends Error {
  constructor() { super("PayMongo configuration is unavailable."); this.name = "PayMongoConfigurationError"; }
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
  liveModeEnabled?: boolean;
};

const checkoutResponse = z.object({
  data: z.object({
    id: z.string().regex(/^cs_[A-Za-z0-9_-]{3,190}$/),
    attributes: z.object({ checkout_url: z.url(), livemode: z.boolean() }),
  }),
});

function safeCheckoutUrl(value: string) {
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname === "checkout.paymongo.com" && !url.username && !url.password;
}

function providerTimestamp(value: unknown): string | null {
  const candidate = typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? new Date(value * 1000)
    : typeof value === "string" && value.length <= 50 ? new Date(value) : null;
  return candidate && Number.isFinite(candidate.getTime()) ? candidate.toISOString() : null;
}

function modeIsEnabled(mode: PayMongoMode, environment: string | undefined, testModeEnabled: boolean, liveModeEnabled: boolean) {
  if (environment === "production") {
    if (testModeEnabled === liveModeEnabled) return false;
    return mode === "test" ? testModeEnabled : liveModeEnabled;
  }
  return mode === "test";
}

function configuredMode(key: string | undefined, environment: string | undefined, testModeEnabled: boolean, liveModeEnabled: boolean) {
  const mode = modeForSecretKey(key);
  return mode && modeIsEnabled(mode, environment, testModeEnabled, liveModeEnabled) ? mode : null;
}

export function isPayMongoConfigured() {
  return configuredMode(process.env.PAYMONGO_SECRET_KEY, process.env.NODE_ENV,
    process.env.PAYMONGO_TEST_MODE_ENABLED === "true", process.env.PAYMONGO_LIVE_MODE_ENABLED === "true") !== null;
}

export function createPayMongoProvider(options: ProviderOptions = {}): PaymentProvider {
  const fetcher = options.fetcher ?? fetch;
  const environment = options.nodeEnvironment ?? process.env.NODE_ENV;
  const testModeEnabled = options.testModeEnabled ?? process.env.PAYMONGO_TEST_MODE_ENABLED === "true";
  const liveModeEnabled = options.liveModeEnabled ?? process.env.PAYMONGO_LIVE_MODE_ENABLED === "true";
  const secretKey = () => {
    const value = options.apiKey ?? process.env.PAYMONGO_SECRET_KEY;
    const mode = configuredMode(value, environment, testModeEnabled, liveModeEnabled);
    if (!mode || !value) throw new PayMongoConfigurationError();
    return { value: value.trim(), mode };
  };

  async function requestJson(url: string, init: RequestInit, key = secretKey().value): Promise<unknown> {
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
      throw new Error("PayMongo request failed.");
    }
  }

  return {
    id: "paymongo",
    async createCheckout(request: AcceptedPaymentRequest) {
      const config = secretKey();
      if (!/^[0-9a-f-]{36}$/i.test(request.idempotencyKey)) throw new Error("Payment idempotency is unavailable.");
      const body = buildCheckoutSessionBody(request, siteUrl());
      const result = await requestJson(paymongoApi, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": request.idempotencyKey },
        body: JSON.stringify(body),
      }, config.value);
      const parsed = checkoutResponse.safeParse(result);
      if (!parsed.success || parsed.data.data.attributes.livemode !== (config.mode === "live")
        || !safeCheckoutUrl(parsed.data.data.attributes.checkout_url)) {
        throw new Error("PayMongo returned a checkout for an unexpected mode.");
      }
      return { reference: parsed.data.data.id, url: parsed.data.data.attributes.checkout_url };
    },
    async getPaymentStatus(reference: string) {
      const config = secretKey();
      if (!/^cs_[A-Za-z0-9_-]{3,190}$/.test(reference)) throw new Error("Invalid PayMongo checkout reference.");
      const result = await requestJson(`${paymongoApi}/${encodeURIComponent(reference)}`, { method: "GET" }, config.value);
      const parsed = checkoutResponse.safeParse(result);
      if (!parsed.success || parsed.data.data.id !== reference || parsed.data.data.attributes.livemode !== (config.mode === "live")) throw new Error("PayMongo status mode does not match this deployment.");
      const value = result as { data: { id: string; attributes: { status?: string; payments?: Array<{ id?: string; attributes?: { status?: string; amount?: number; currency?: string; paid_at?: number | string; created_at?: number | string; livemode?: boolean } }> } } };
      const paid = value.data.attributes.payments?.filter((payment) => payment.attributes?.status === "paid") ?? [];
      if (paid.length === 1) {
        const payment = paid[0];
        const attrs = payment.attributes;
        const paidAt = providerTimestamp(attrs?.paid_at ?? attrs?.created_at);
        if (!payment.id || !Number.isSafeInteger(attrs?.amount) || !attrs?.currency || !paidAt
          || (attrs.livemode !== undefined && attrs.livemode !== (config.mode === "live"))) throw new Error("PayMongo status is invalid.");
        return {
          eventId: `checkout-status:${reference}:${payment.id}`,
          reference,
          paidAt,
          amountMinor: attrs.amount!,
          currency: attrs.currency,
        } satisfies VerifiedProviderPayment;
      }
      return { state: value.data.attributes.status === "expired" ? "EXPIRED" : "PENDING" } as const;
    },
    async verifyWebhook(rawBody: Uint8Array, headers: Headers): Promise<ProviderWebhookResult> {
      const config = secretKey();
      const webhookSecret = options.webhookSecret ?? process.env.PAYMONGO_WEBHOOK_SECRET;
      if (!webhookSecret?.trim()) throw new PayMongoConfigurationError();
      if (!verifyPayMongoSignature(rawBody, headers.get("paymongo-signature"), webhookSecret, config.mode)) {
        throw new PayMongoWebhookVerificationError();
      }
      let payload: unknown;
      try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody)); }
      catch { throw new PayMongoWebhookVerificationError(); }
      try { return parsePayMongoWebhook(payload, config.mode); }
      catch { throw new PayMongoWebhookVerificationError(); }
    },
    async refundPayment(request) {
      void request;
      // Refund processing is still an owner-approved/manual PayMongo operation.
      throw new Error("Refund operations are not available through this integration.");
    },
  };
}
