import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCheckoutSessionBody, isLiveSecretKey, isTestSecretKey, modeForSecretKey, parsePayMongoWebhook, verifyPayMongoSignature } from "../../src/lib/payments/paymongo-core";
import { createPayMongoProvider, isPayMongoConfigured } from "../../src/lib/payments/paymongo.server";
import type { AcceptedPaymentRequest } from "../../src/lib/payments/provider";

const request: AcceptedPaymentRequest = {
  appointmentId: "00000000-0000-4000-8000-000000000001",
  amountMinor: 19_500,
  currency: "PHP",
  deadline: "2026-10-03T09:00:00.000Z",
  idempotencyKey: "00000000-0000-4000-8000-000000000002",
  serviceName: "Consultation",
  publicReference: "BK-TEST1234",
};

const webhook = {
  event_type: "send.webhook",
  data: {
    id: "evt_test123",
    type: "checkout_session.payment.paid",
    resource: "checkout_session",
    livemode: false,
    created_at: "2026-10-03T08:00:00.000Z",
    data: {
      id: "cs_test123",
      type: "checkout_session",
      attributes: {
        payments: [{
          id: "pay_test123",
          attributes: { amount: 19_500, currency: "PHP", status: "paid", paid_at: 1791014400, livemode: false },
        }],
      },
    },
  },
};

function signed(raw: Uint8Array, secret: string, timestamp: number, mode: "test" | "live" = "test") {
  const signature = createHmac("sha256", secret).update(String(timestamp)).update(".").update(raw).digest("hex");
  return `t=${timestamp},te=${mode === "test" ? signature : ""},li=${mode === "live" ? signature : ""}`;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("PayMongo Hosted Checkout", () => {
  it("builds a v2 checkout using the server-derived minor-unit amount and business currency", () => {
    const body = buildCheckoutSessionBody(request, "https://appointments.example.test");
    const attrs = body.data.attributes;
    expect(attrs.line_items).toEqual([{
      name: "Consultation", description: "Appointment BK-TEST1234", amount: 19_500, currency: "PHP", quantity: 1,
    }]);
    expect(attrs.payment_method_types).toEqual(["card", "gcash", "qrph"]);
    expect(attrs.reference_number).toBe("BK-TEST1234");
    expect(attrs.success_url).toBe("https://appointments.example.test/payment/return?result=checking&appointmentId=00000000-0000-4000-8000-000000000001");
    expect(attrs.cancel_url).toBe("https://appointments.example.test/payment/return?result=cancelled&appointmentId=00000000-0000-4000-8000-000000000001");
    expect(() => buildCheckoutSessionBody({ ...request, currency: "USD" }, "https://appointments.example.test")).toThrow(/does not support/);
  });

  it("identifies test and live key mode from the server-side secret prefix", () => {
    expect(isTestSecretKey("sk_test_unit-value")).toBe(true);
    expect(isLiveSecretKey("sk_live_unit-value")).toBe(true);
    expect(isTestSecretKey(undefined)).toBe(false);
    expect(modeForSecretKey("sk_test_unit-value")).toBe("test");
    expect(modeForSecretKey("sk_live_unit-value")).toBe("live");
    expect(modeForSecretKey("wrong-prefix")).toBeNull();
  });

  it("creates one v2 hosted session with the persisted idempotency key and verifies test mode", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://appointments.example.test";
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      data: { id: "cs_test123", attributes: { checkout_url: "https://checkout.paymongo.com/cs_test123#not-logged", livemode: false } },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const provider = createPayMongoProvider({ apiKey: "sk_test_unit-value", fetcher, nodeEnvironment: "development" });
    const result = await provider.createCheckout(request);
    expect(result.reference).toBe("cs_test123");
    expect(new URL(result.url).hostname).toBe("checkout.paymongo.com");
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.paymongo.com/v2/checkout_sessions");
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(request.idempotencyKey);
    expect(new Headers(init?.headers).get("Authorization")).toMatch(/^Basic /);
    expect(JSON.parse(String(init?.body)).data.attributes.line_items[0].amount).toBe(19_500);
  });

  it("rejects live keys outside production and never makes a provider request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const provider = createPayMongoProvider({ apiKey: "sk_live_unit-value", fetcher, nodeEnvironment: "development" });
    await expect(provider.createCheckout(request)).rejects.toThrow(/configuration is unavailable/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("enables production test checkout only with its explicit flag", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      data: { id: "cs_test123", attributes: { checkout_url: "https://checkout.paymongo.com/cs_test123#not-logged", livemode: false } },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const disabled = createPayMongoProvider({ apiKey: "sk_test_unit-value", fetcher, nodeEnvironment: "production", testModeEnabled: false });
    await expect(disabled.createCheckout(request)).rejects.toThrow(/configuration is unavailable/);
    expect(fetcher).not.toHaveBeenCalled();

    const enabled = createPayMongoProvider({ apiKey: "sk_test_unit-value", fetcher, nodeEnvironment: "production", testModeEnabled: true });
    await expect(enabled.createCheckout(request)).resolves.toMatchObject({ reference: "cs_test123" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const live = createPayMongoProvider({ apiKey: "sk_live_unit-value", fetcher, nodeEnvironment: "production", testModeEnabled: true });
    await expect(live.createCheckout(request)).rejects.toThrow(/configuration is unavailable/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("allows production live checkout only with a live key and explicit live opt-in", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      data: { id: "cs_live123", attributes: { checkout_url: "https://checkout.paymongo.com/cs_live123#not-logged", livemode: true } },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const disabled = createPayMongoProvider({ apiKey: "sk_live_unit-value", fetcher, nodeEnvironment: "production", liveModeEnabled: false });
    await expect(disabled.createCheckout(request)).rejects.toThrow(/configuration is unavailable/);
    const enabled = createPayMongoProvider({ apiKey: "sk_live_unit-value", fetcher, nodeEnvironment: "production", liveModeEnabled: true });
    await expect(enabled.createCheckout(request)).resolves.toMatchObject({ reference: "cs_live123" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const contradictory = createPayMongoProvider({ apiKey: "sk_live_unit-value", fetcher, nodeEnvironment: "production", liveModeEnabled: true, testModeEnabled: true });
    await expect(contradictory.createCheckout(request)).rejects.toThrow(/configuration is unavailable/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("requires a matching production mode flag when detecting the configured server key", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_unit-value");
    vi.stubEnv("PAYMONGO_TEST_MODE_ENABLED", "false");
    vi.stubEnv("PAYMONGO_LIVE_MODE_ENABLED", "false");
    expect(isPayMongoConfigured()).toBe(false);
    vi.stubEnv("PAYMONGO_TEST_MODE_ENABLED", "true");
    expect(isPayMongoConfigured()).toBe(true);
    vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_live_unit-value");
    expect(isPayMongoConfigured()).toBe(false);
    vi.stubEnv("PAYMONGO_TEST_MODE_ENABLED", "false");
    vi.stubEnv("PAYMONGO_LIVE_MODE_ENABLED", "true");
    expect(isPayMongoConfigured()).toBe(true);
  });

  it("validates raw-body test and live signatures and detects tampering", () => {
    const raw = new TextEncoder().encode(JSON.stringify(webhook));
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signed(raw, "webhook-test-secret", timestamp);
    expect(verifyPayMongoSignature(raw, signature, "webhook-test-secret", "test")).toBe(true);
    expect(verifyPayMongoSignature(new TextEncoder().encode(`${new TextDecoder().decode(raw)} `), signature, "webhook-test-secret", "test")).toBe(false);
    expect(verifyPayMongoSignature(raw, null, "webhook-test-secret", "test")).toBe(false);
    expect(verifyPayMongoSignature(raw, `t=${timestamp},te=abcd,li=`, "webhook-test-secret", "test")).toBe(false);
    const liveSignature = signed(raw, "webhook-live-secret", timestamp, "live");
    expect(verifyPayMongoSignature(raw, liveSignature, "webhook-live-secret", "live")).toBe(true);
    expect(verifyPayMongoSignature(raw, liveSignature, "webhook-live-secret", "test")).toBe(false);
  });

  it("normalizes only a paid, non-live checkout event and uses stable event identity", () => {
    const result = parsePayMongoWebhook(webhook, "test");
    expect(result).toEqual({
      eventId: "evt_test123", reference: "cs_test123", paidAt: "2026-10-03T08:00:00.000Z", amountMinor: 19_500, currency: "PHP",
    });
    expect(parsePayMongoWebhook({ data: { type: "payment.failed", livemode: false } }, "test")).toEqual({ ignored: true });
    expect(() => parsePayMongoWebhook({ ...webhook, data: { ...webhook.data, livemode: true } }, "test")).toThrow(/mode/);
    const live = { ...webhook, data: { ...webhook.data, id: "evt_live123", livemode: true, data: {
      ...webhook.data.data, id: "cs_live123", attributes: { payments: [{ id: "pay_live123", attributes: {
        amount: 19_500, currency: "PHP", status: "paid", paid_at: 1791014400, livemode: true,
      } }] },
    } } };
    expect(parsePayMongoWebhook(live, "live")).toMatchObject({ eventId: "evt_live123", reference: "cs_live123", amountMinor: 19_500 });
  });

  it("verifies webhook bytes before parsing provider payment details", async () => {
    const raw = new TextEncoder().encode(JSON.stringify(webhook));
    const timestamp = Math.floor(Date.now() / 1000);
    const headers = new Headers({ "Paymongo-Signature": signed(raw, "webhook-test-secret", timestamp) });
    const provider = createPayMongoProvider({ apiKey: "sk_test_unit-value", webhookSecret: "webhook-test-secret", nodeEnvironment: "development" });
    await expect(provider.verifyWebhook(raw, headers)).resolves.toMatchObject({ reference: "cs_test123", amountMinor: 19_500 });
    await expect(provider.verifyWebhook(new TextEncoder().encode(`${new TextDecoder().decode(raw)} `), headers)).rejects.toThrow(/verification failed/);
  });

  it("verifies a live webhook with the live signature field and the configured live mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://appointments.example.test");
    const live = { ...webhook, data: { ...webhook.data, id: "evt_live123", livemode: true, data: {
      ...webhook.data.data, id: "cs_live123", attributes: { payments: [{ id: "pay_live123", attributes: {
        amount: 19_500, currency: "PHP", status: "paid", paid_at: 1791014400, livemode: true,
      } }] },
    } } };
    const raw = new TextEncoder().encode(JSON.stringify(live));
    const timestamp = Math.floor(Date.now() / 1000);
    const headers = new Headers({ "Paymongo-Signature": signed(raw, "webhook-live-secret", timestamp, "live") });
    const provider = createPayMongoProvider({ apiKey: "sk_live_unit-value", webhookSecret: "webhook-live-secret", nodeEnvironment: "production", liveModeEnabled: true });
    await expect(provider.verifyWebhook(raw, headers)).resolves.toMatchObject({ reference: "cs_live123", amountMinor: 19_500 });
  });
});
