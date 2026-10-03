import { describe, expect, it, vi } from "vitest";
import { createResendSender } from "@/server/email/client";

const valid = {
  kind: "booking.request_received" as const,
  to: "customer@example.test",
  subject: "We received your request",
  text: "Your request is waiting for review.",
};

describe("server transactional email sender", () => {
  it("fails safely and does not attempt delivery without configuration", async () => {
    const fetcher = vi.fn();
    const send = createResendSender({ fetcher });
    await expect(send(valid)).resolves.toEqual({ ok: false, code: "not_configured", retryable: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects invalid addresses, unsupported kinds, and empty bodies before delivery", async () => {
    const fetcher = vi.fn();
    const send = createResendSender({ apiKey: "test-key", from: "no-reply@example.test", fetcher });
    await expect(send({ ...valid, to: "not-an-email" })).resolves.toMatchObject({ code: "invalid_input" });
    await expect(send({ ...valid, kind: "role_changed" })).resolves.toMatchObject({ code: "invalid_input" });
    await expect(send({ ...valid, text: "", html: " " })).resolves.toMatchObject({ code: "invalid_input" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends only the validated message to the provider with an idempotency key", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: "email-id" }), { status: 200 }));
    const send = createResendSender({ apiKey: "test-key", from: "no-reply@example.test", fetcher });
    await expect(send({ ...valid, idempotencyKey: "booking-123" })).resolves.toEqual({ ok: true, id: "email-id" });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(new Headers(options?.headers).get("Idempotency-Key")).toBe("booking-123");
    expect(JSON.parse(String(options?.body))).toMatchObject({ to: [valid.to], subject: valid.subject, text: valid.text });
  });

  it("accepts a validated display name and email sender", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: "email-id" }), { status: 200 }));
    const send = createResendSender({ apiKey: "test-key", from: "Zentra Bookings <bookings@notifications.zentra.surf>", fetcher });
    await expect(send(valid)).resolves.toEqual({ ok: true, id: "email-id" });
    const [, options] = fetcher.mock.calls[0];
    expect(JSON.parse(String(options?.body)).from).toBe("Zentra Bookings <bookings@notifications.zentra.surf>");
  });

  it("rejects malformed display name senders before contacting the provider", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const send = createResendSender({ apiKey: "test-key", from: "Zentra\nBookings <bookings@notifications.zentra.surf>", fetcher });
    await expect(send(valid)).resolves.toEqual({ ok: false, code: "not_configured", retryable: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns provider and network failures without exposing provider response content", async () => {
    const providerSend = createResendSender({ apiKey: "test-key", from: "no-reply@example.test", fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response("private provider detail", { status: 500 })) });
    await expect(providerSend(valid)).resolves.toEqual({ ok: false, code: "provider_error", retryable: true });
    const networkSend = createResendSender({ apiKey: "test-key", from: "no-reply@example.test", fetcher: vi.fn<typeof fetch>().mockRejectedValue(new Error("secret network detail")) });
    await expect(networkSend(valid)).resolves.toEqual({ ok: false, code: "network_error", retryable: true });
  });

  it("treats provider rate limits and server failures as retryable", async () => {
    for (const status of [429, 500, 503]) {
      const send = createResendSender({ apiKey: "test-key", from: "no-reply@example.test", fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response("provider detail", { status })) });
      await expect(send(valid)).resolves.toEqual({ ok: false, code: "provider_error", retryable: true });
    }
  });
});
