import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startPaymentCheckout: vi.fn(),
  createPayMongoProvider: vi.fn(),
  isPayMongoTestConfigured: vi.fn(),
  consumeRateLimit: vi.fn(),
  trustedClientIdentifier: vi.fn(),
}));

vi.mock("@/lib/payments/checkout.server", () => ({ startPaymentCheckout: mocks.startPaymentCheckout }));
vi.mock("@/lib/payments/paymongo.server", () => ({
  createPayMongoProvider: mocks.createPayMongoProvider,
  isPayMongoTestConfigured: mocks.isPayMongoTestConfigured,
}));
vi.mock("@/features/availability/rate-limit.server", () => ({
  consumeRateLimit: mocks.consumeRateLimit,
  trustedClientIdentifier: mocks.trustedClientIdentifier,
}));

import * as checkoutRoute from "@/app/api/payments/checkout/route";

const appointmentId = "00000000-0000-4000-8000-000000000001";
const siteOrigin = "https://appointmentdemo.zentra.surf";

function request(origin?: string, accept = "application/json") {
  const headers = new Headers({
    accept,
    "content-type": "application/x-www-form-urlencoded",
  });
  if (origin !== undefined) headers.set("origin", origin);
  return new Request("https://internal-proxy.invalid/api/payments/checkout", {
    method: "POST",
    headers,
    body: new URLSearchParams({ appointmentId }),
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", siteOrigin);
  vi.clearAllMocks();
  mocks.consumeRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
  mocks.isPayMongoTestConfigured.mockReturnValue(true);
  mocks.createPayMongoProvider.mockReturnValue({ id: "paymongo-test-provider" });
  mocks.startPaymentCheckout.mockResolvedValue({
    checkoutUrl: "https://checkout.paymongo.com/cs_test_checkout",
    reused: false,
  });
});

describe("PayMongo checkout HTTP boundary", () => {
  it("accepts the exact configured same-origin request past CSRF and returns the hosted URL", async () => {
    const response = await checkoutRoute.POST(request(siteOrigin));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ checkoutUrl: "https://checkout.paymongo.com/cs_test_checkout" });
    expect(mocks.consumeRateLimit).toHaveBeenCalledOnce();
    expect(mocks.startPaymentCheckout).toHaveBeenCalledWith(appointmentId, expect.anything());
  });

  it.each([
    ["cross-origin", "https://other.example"],
    ["malicious origin", "https://appointmentdemo.zentra.surf.attacker.example"],
    ["null origin", "null"],
  ])("rejects %s before rate limiting or checkout preparation", async (_label, origin) => {
    const response = await checkoutRoute.POST(request(origin));

    expect(response.status).toBe(403);
    expect(mocks.consumeRateLimit).not.toHaveBeenCalled();
    expect(mocks.startPaymentCheckout).not.toHaveBeenCalled();
  });

  it("rejects a missing origin before rate limiting or checkout preparation", async () => {
    const response = await checkoutRoute.POST(request(undefined));

    expect(response.status).toBe(403);
    expect(mocks.consumeRateLimit).not.toHaveBeenCalled();
    expect(mocks.startPaymentCheckout).not.toHaveBeenCalled();
  });

  it("rejects a path-bearing origin instead of normalizing it to the trusted origin", async () => {
    const response = await checkoutRoute.POST(request(`${siteOrigin}/attacker-path`));

    expect(response.status).toBe(403);
    expect(mocks.startPaymentCheckout).not.toHaveBeenCalled();
  });

  it("does not expose a GET handler that could create checkout", () => {
    expect("GET" in checkoutRoute).toBe(false);
  });
});
