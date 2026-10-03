import { beforeEach, describe, expect, it, vi } from "vitest";

const { clientFactory, sendEmail } = vi.hoisted(() => ({ clientFactory: vi.fn(), sendEmail: vi.fn() }));
vi.mock("@/lib/supabase/privileged.server", () => ({ createPrivilegedClient: clientFactory }));
vi.mock("@/server/email/send-email", () => ({ sendTransactionalEmail: sendEmail }));

import { dispatchNotificationOutbox } from "@/server/email/outbox.server";

const appointmentId = "11111111-1111-4111-8111-111111111111";
const customerId = "22222222-2222-4222-8222-222222222222";
const staffId = "33333333-3333-4333-8333-333333333333";
const eventId = "44444444-4444-4444-8444-444444444444";
const job = {
  id: "55555555-5555-4555-8555-555555555555",
  appointment_id: appointmentId,
  kind: "APPOINTMENT_STATE_CHANGED",
  deduplication_key: eventId,
  payload: { state: "PENDING" },
  state: "PROCESSING",
  attempts: 1,
  available_at: "2026-10-03T00:00:00Z",
  locked_until: "2026-10-03T00:02:00Z",
  last_error_code: null,
  created_at: "2026-10-03T00:00:00Z",
  updated_at: "2026-10-03T00:00:00Z",
};

function setup(input: { jobs?: typeof job[]; bookingState?: string; verifiedPayments?: { id: string; amount: number; currency?: string; state?: string; exception_reason?: string | null }[] } = {}) {
  const jobs = input.jobs ?? [job];
  const acknowledgments: Record<string, unknown>[] = [];
  const tableData: Record<string, unknown> = {
    business_settings: { name: "Test Studio", timezone: "UTC", contact_email: "business@example.test", contact_phone: null, booking_approval_mode: "ADMIN_APPROVAL" },
    appointment_events: { id: eventId, to_state: input.bookingState ?? "PENDING", reason: null },
    appointments: { id: appointmentId, public_reference: "BK-0123456789ABCDEF", state: input.bookingState ?? "PENDING", starts_at: "2030-01-01T10:00:00Z", currency: "PHP", total_amount: 1000, required_payment_amount: 500, payment_due_at: "2030-01-01T09:00:00Z", customer_id: customerId, staff_id: staffId },
    appointment_items: { service_name_snapshot: "Consultation" },
    staff: { display_name: "Assigned Staff", auth_user_id: null, active: true },
    customers: { display_name: "Guest Customer", email: "guest@example.test", auth_user_id: null },
    profiles: null,
    user_roles: [],
    payments: input.verifiedPayments ?? [],
  };
  const client = {
    auth: { admin: { getUserById: vi.fn() } },
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const builder: Record<string, unknown> = {};
      Object.assign(builder, {
        select: () => builder,
        eq: (column: string, value: unknown) => { filters[column] = value; return builder; },
        is: (column: string, value: unknown) => { filters[column] = value; return builder; },
        in: (column: string, value: unknown) => { filters[column] = value; return builder; },
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({ data: Array.isArray(tableData[table]) ? tableData[table][0] ?? null : tableData[table] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
          Promise.resolve({ data: tableData[table] ?? [], error: null }).then(resolve, reject),
      });
      return builder;
    },
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "claim_notification_outbox") return { data: jobs, error: null };
      if (name === "issue_guest_access_link") return { data: { appointment_id: appointmentId, token: "a".repeat(43) }, error: null };
      if (name === "record_notification_delivery") return { data: true, error: null };
      if (name === "finish_notification_outbox") { acknowledgments.push(args); return { data: true, error: null }; }
      return { data: null, error: { message: "unexpected rpc" } };
    }),
  };
  clientFactory.mockReturnValue(client);
  return { client, acknowledgments, jobs };
}

describe("canonical transactional outbox dispatcher", () => {
  beforeEach(() => {
    clientFactory.mockReset();
    sendEmail.mockReset();
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  });

  it("sends through the Resend abstraction and acknowledges the claimed job", async () => {
    const { client, acknowledgments, jobs } = setup();
    sendEmail.mockResolvedValue({ ok: true, id: "resend-test-id" });

    await expect(dispatchNotificationOutbox(5)).resolves.toEqual({ claimed: 1, delivered: 1, retrying: 0, failed: 0 });
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ kind: "booking.request_received", to: "guest@example.test" });
    expect(client.rpc).toHaveBeenCalledWith("claim_notification_outbox", { p_limit: 5 });
    expect(client.rpc).toHaveBeenCalledWith("record_notification_delivery", expect.objectContaining({ p_outbox_id: job.id, p_provider_message_id: "resend-test-id" }));
    expect(acknowledgments).toEqual([expect.objectContaining({ p_id: job.id, p_success: true })]);
    jobs.length = 0;
    await dispatchNotificationOutbox(5);
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it("marks temporary provider errors retryable and reuses the same idempotency key", async () => {
    const { acknowledgments } = setup();
    sendEmail
      .mockResolvedValueOnce({ ok: false, code: "network_error", retryable: true })
      .mockResolvedValueOnce({ ok: true, id: "resend-test-id" });

    await expect(dispatchNotificationOutbox(5)).resolves.toMatchObject({ retrying: 1, failed: 0 });
    const firstKey = sendEmail.mock.calls[0][0].idempotencyKey;
    await expect(dispatchNotificationOutbox(5)).resolves.toMatchObject({ delivered: 1 });
    const secondKey = sendEmail.mock.calls[1][0].idempotencyKey;

    expect(firstKey).toBe(secondKey);
    expect(acknowledgments).toEqual([
      expect.objectContaining({ p_success: false, p_retryable: true, p_error_code: "network_error" }),
      expect.objectContaining({ p_success: true }),
    ]);
  });

  it("uses a verified successful payment row before choosing payment-confirmed copy", async () => {
    setup({ bookingState: "CONFIRMED", verifiedPayments: [{ id: "payment-1", amount: 500 }] });
    sendEmail.mockResolvedValue({ ok: true, id: "resend-test-id" });

    await dispatchNotificationOutbox(5);

    expect(sendEmail.mock.calls[0][0]).toMatchObject({ kind: "booking.payment_confirmed" });
  });

  it("does not label a confirmation as payment confirmed without a verified payment row", async () => {
    setup({ bookingState: "CONFIRMED", verifiedPayments: [] });
    sendEmail.mockResolvedValue({ ok: true, id: "resend-test-id" });

    await dispatchNotificationOutbox(5);

    expect(sendEmail.mock.calls[0][0]).toMatchObject({ kind: "booking.confirmed" });
  });

  it("delivers late payment exceptions to the configured business contact", async () => {
    setup({
      jobs: [{ ...job, kind: "PAYMENT_EXCEPTION", deduplication_key: "payment-exception:payment-1" }],
      verifiedPayments: [{ id: "payment-1", amount: 500, currency: "PHP", state: "SUCCEEDED", exception_reason: "LATE_PAYMENT_REVIEW" }],
    });
    sendEmail.mockResolvedValue({ ok: true, id: "resend-test-id" });

    await expect(dispatchNotificationOutbox(5)).resolves.toMatchObject({ delivered: 1 });

    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ kind: "business.payment_exception", to: "business@example.test" });
  });

  it("treats Resend 429 responses as retryable and keeps the outbox job", async () => {
    const { acknowledgments } = setup();
    sendEmail.mockResolvedValue({ ok: false, code: "provider_error", retryable: true });
    await expect(dispatchNotificationOutbox(5)).resolves.toMatchObject({ retrying: 1, failed: 0 });
    expect(acknowledgments[0]).toMatchObject({ p_success: false, p_retryable: true, p_error_code: "provider_error" });
  });

  it("uses the same provider idempotency key across a retry", async () => {
    const { client } = setup();
    sendEmail.mockResolvedValue({ ok: true, id: "resend-test-id" });
    await dispatchNotificationOutbox(5);
    const firstKey = sendEmail.mock.calls[0][0].idempotencyKey;
    await dispatchNotificationOutbox(5);
    expect(sendEmail.mock.calls[1][0].idempotencyKey).toBe(firstKey);
    expect(client.rpc).toHaveBeenCalledTimes(8); // claim, link issue, receipt, finish for each pass
  });
});
