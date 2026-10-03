import { describe, expect, it } from "vitest";
import { renderAppointmentEmail, renderGuestAccessEmail } from "@/server/email/templates";

const base = {
  to: "customer@example.test",
  kind: "booking.payment_required" as const,
  reference: "AB-1234",
  serviceName: "Hair cut <script>alert(1)</script>",
  staffName: "Alex & Co",
  startsAt: "2026-12-02T10:00:00.000Z",
  timezone: "UTC",
  business: { name: "Zentra <Bookings>", contactEmail: "help@example.test" },
  amountMinor: 12500,
  currency: "PHP",
  paymentDueAt: "2026-12-01T10:00:00.000Z",
  ctaUrl: "https://appointments.example.test/account/appointments",
  idempotencyKey: "unit-test-key",
};

describe("transactional email templates", () => {
  it("renders a safe text and responsive HTML payment request", () => {
    const email = renderAppointmentEmail(base);
    expect(email.subject).toContain("payment required");
    expect(email.text).toContain("Payment deadline:");
    expect(email.text).toContain("https://appointments.example.test/account/appointments");
    expect(email.html).toContain("Zentra &lt;Bookings&gt;");
    expect(email.html).toContain("Hair cut &lt;script&gt;");
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("7f3337be-");
  });

  it("keeps guest one-time access credentials only in the requested link", () => {
    const token = "a".repeat(48);
    const email = renderGuestAccessEmail({
      to: "guest@example.test", reference: "AB-5678",
      bookingUrl: `https://appointments.example.test/booking/access#token=${token}`,
      businessName: "Zentra",
    });
    expect(email.text).toContain(`#token=${token}`);
    expect(email.html).toContain("#token=");
    expect(email.subject).not.toContain(token);
  });

  it("escapes the safe customer-facing decline reason", () => {
    const email = renderAppointmentEmail({
      ...base, kind: "booking.declined", amountMinor: undefined, currency: undefined, paymentDueAt: null,
      declineReason: "<script>blocked</script>",
    });
    expect(email.text).toContain("Reason: <script>blocked</script>");
    expect(email.html).toContain("Reason:</strong> &lt;script&gt;blocked&lt;/script&gt;");
    expect(email.html).not.toContain("<script>");
  });
});
