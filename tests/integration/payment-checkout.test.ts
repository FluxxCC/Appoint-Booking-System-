import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentProvider } from "../../src/lib/payments/provider";

const mocks = vi.hoisted(() => ({
  readVerifiedUser: vi.fn(),
  cookies: vi.fn(),
  createPrivilegedClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-user.server", () => ({ readVerifiedUser: mocks.readVerifiedUser }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/supabase/privileged.server", () => ({ createPrivilegedClient: mocks.createPrivilegedClient }));

import { startPaymentCheckout } from "../../src/lib/payments/checkout.server";

const appointmentId = "00000000-0000-4000-8000-000000000001";
const customerId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000003";
const guestToken = "G".repeat(43);
const paymentId = "00000000-0000-4000-8000-000000000004";

function queryResult(data: unknown) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  return chain;
}

function makeClients(options: { customer?: unknown; ownedAppointment?: unknown; guestContext?: unknown; checkoutUrl?: string }) {
  const userClient = {
    from: vi.fn((table: string) => queryResult(table === "customers" ? options.customer ?? null : options.ownedAppointment ?? null)),
    rpc: vi.fn(async (name: string) => name === "guest_appointment_by_token" ? { data: options.guestContext ?? null, error: null } : { data: null, error: null }),
  };
  const privileged = {
    from: vi.fn((table: string) => queryResult(table === "appointments" ? { public_reference: "BK-TEST1234" } : { service_name_snapshot: "Consultation" })),
    rpc: vi.fn(async (name: string) => {
      if (name === "prepare_payment_attempt") return { data: {
        payment_id: paymentId, appointment_id: appointmentId, amount_minor: 19_500, currency: "PHP",
        idempotency_key: "00000000-0000-4000-8000-000000000005", provider_reference: null,
        checkout_url: null, payment_due_at: "2026-10-03T09:00:00.000Z", reused: false,
      }, error: null };
      return { data: { payment_id: paymentId, provider_reference: "cs_test123", checkout_url: options.checkoutUrl ?? "https://checkout.paymongo.com/cs_test123#private", reused: false }, error: null };
    }),
  };
  mocks.createPrivilegedClient.mockReturnValue(privileged);
  return { userClient, privileged };
}

function provider(checkout?: PaymentProvider["createCheckout"]): PaymentProvider {
  return {
    id: "paymongo",
    createCheckout: checkout ?? vi.fn(async () => ({ reference: "cs_test123", url: "https://checkout.paymongo.com/cs_test123#private" })),
    getPaymentStatus: vi.fn(),
    verifyWebhook: vi.fn(),
    refundPayment: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookies.mockResolvedValue({ get: vi.fn(() => ({ value: guestToken })) });
});

describe("trusted customer and guest PayMongo checkout", () => {
  it("authorizes a registered customer and uses only the server-derived amount and currency", async () => {
    const { userClient } = makeClients({ customer: { id: customerId }, ownedAppointment: { id: appointmentId } });
    mocks.readVerifiedUser.mockResolvedValue({ user: { id: userId }, supabase: userClient });
    const createCheckout = vi.fn(async () => ({ reference: "cs_test123", url: "https://checkout.paymongo.com/cs_test123#private" }));
    const result = await startPaymentCheckout(appointmentId, provider(createCheckout));
    expect(result).toEqual({ checkoutUrl: "https://checkout.paymongo.com/cs_test123#private", reused: false });
    expect(createCheckout).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 19_500, currency: "PHP", serviceName: "Consultation", publicReference: "BK-TEST1234" }));
    expect(mocks.cookies).not.toHaveBeenCalled();
  });

  it("authorizes a guest only through the appointment-scoped VIEW token context", async () => {
    const { userClient, privileged } = makeClients({ guestContext: { id: appointmentId } });
    mocks.readVerifiedUser.mockResolvedValue({ user: null, supabase: userClient });
    const result = await startPaymentCheckout(appointmentId, provider());
    expect(result.checkoutUrl).toContain("checkout.paymongo.com");
    expect(userClient.rpc).toHaveBeenCalledWith("guest_appointment_by_token", expect.objectContaining({ p_appointment: appointmentId }));
    expect(privileged.rpc).toHaveBeenCalledWith("prepare_payment_attempt", expect.objectContaining({ p_auth_user: null, p_guest_token_hash: expect.any(String) }));
  });

  it("rejects another customer's appointment and an unauthorized guest before provider creation", async () => {
    const { userClient, privileged } = makeClients({ customer: { id: customerId }, ownedAppointment: null, guestContext: null });
    mocks.readVerifiedUser.mockResolvedValue({ user: { id: userId }, supabase: userClient });
    const createCheckout = vi.fn();
    await expect(startPaymentCheckout(appointmentId, provider(createCheckout))).rejects.toThrow(/access denied/i);
    expect(privileged.rpc).not.toHaveBeenCalled();

    mocks.readVerifiedUser.mockResolvedValue({ user: null, supabase: userClient });
    await expect(startPaymentCheckout(appointmentId, provider(createCheckout))).rejects.toThrow(/access denied/i);
    expect(createCheckout).not.toHaveBeenCalled();
  });
});
