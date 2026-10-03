import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readPaymentReturnBooking: vi.fn(),
  createPrivilegedClient: vi.fn(),
  createPayMongoProvider: vi.fn(),
  isPayMongoConfigured: vi.fn(),
  settlePayMongoPayment: vi.fn(),
  consumeRateLimit: vi.fn(),
  trustedClientIdentifier: vi.fn(),
  paymentQuery: { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn() },
}));

vi.mock("@/lib/payments/payment-return.server", () => ({ readPaymentReturnBooking: mocks.readPaymentReturnBooking }));
vi.mock("@/lib/supabase/privileged.server", () => ({ createPrivilegedClient: mocks.createPrivilegedClient }));
vi.mock("@/lib/payments/paymongo.server", () => ({ createPayMongoProvider: mocks.createPayMongoProvider, isPayMongoConfigured: mocks.isPayMongoConfigured }));
vi.mock("@/lib/payments/paymongo-settlement.server", () => ({ settlePayMongoPayment: mocks.settlePayMongoPayment }));
vi.mock("@/features/availability/rate-limit.server", () => ({ consumeRateLimit: mocks.consumeRateLimit, trustedClientIdentifier: mocks.trustedClientIdentifier }));

import * as verifyRoute from "@/app/api/payments/verify/route";

const appointmentId = "00000000-0000-4000-8000-000000000001";
const siteOrigin = "https://appointmentdemo.zentra.surf";
const providerFacts = { eventId: "checkout-status:cs_test123:pay_test123", reference: "cs_test123", paidAt: "2026-10-03T08:00:00.000Z", amountMinor: 19_500, currency: "PHP" };

function request(origin = siteOrigin) {
  return new Request("https://internal-proxy.invalid/api/payments/verify", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ appointmentId }),
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", siteOrigin);
  vi.clearAllMocks();
  mocks.readPaymentReturnBooking.mockResolvedValue({ id: appointmentId, state: "AWAITING_PAYMENT" });
  mocks.paymentQuery.select.mockReturnValue(mocks.paymentQuery);
  mocks.paymentQuery.eq.mockReturnValue(mocks.paymentQuery);
  mocks.paymentQuery.order.mockReturnValue(mocks.paymentQuery);
  mocks.paymentQuery.limit.mockReturnValue(mocks.paymentQuery);
  mocks.paymentQuery.maybeSingle.mockResolvedValue({ data: { id: "payment-id", state: "PENDING", provider_reference: "cs_test123", exception_reason: null }, error: null });
  mocks.createPrivilegedClient.mockReturnValue({ from: vi.fn(() => mocks.paymentQuery) });
  mocks.createPayMongoProvider.mockReturnValue({ getPaymentStatus: vi.fn().mockResolvedValue(providerFacts) });
  mocks.isPayMongoConfigured.mockReturnValue(true);
  mocks.settlePayMongoPayment.mockResolvedValue("CONFIRMED");
  mocks.consumeRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
});

describe("authorized payment status verification", () => {
  it("settles only a provider-verified paid session and returns confirmed", async () => {
    const response = await verifyRoute.POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "paid" });
    expect(mocks.readPaymentReturnBooking).toHaveBeenCalledWith(appointmentId);
    expect(mocks.createPayMongoProvider).toHaveBeenCalledOnce();
    expect(mocks.settlePayMongoPayment).toHaveBeenCalledWith(providerFacts);
  });

  it("does not settle or report paid while PayMongo still shows pending", async () => {
    mocks.createPayMongoProvider.mockReturnValue({ getPaymentStatus: vi.fn().mockResolvedValue({ state: "PENDING" }) });

    const response = await verifyRoute.POST(request());

    expect(await response.json()).toEqual({ status: "pending" });
    expect(mocks.settlePayMongoPayment).not.toHaveBeenCalled();
  });

  it("does not reveal or inspect an appointment without its authenticated owner or guest session", async () => {
    mocks.readPaymentReturnBooking.mockResolvedValue(null);

    const response = await verifyRoute.POST(request());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ status: "unavailable" });
    expect(mocks.createPayMongoProvider).not.toHaveBeenCalled();
  });

  it("rejects cross-origin requests before checking ownership or provider status", async () => {
    const response = await verifyRoute.POST(request("https://other.example"));

    expect(response.status).toBe(403);
    expect(mocks.readPaymentReturnBooking).not.toHaveBeenCalled();
    expect(mocks.createPayMongoProvider).not.toHaveBeenCalled();
  });
});
