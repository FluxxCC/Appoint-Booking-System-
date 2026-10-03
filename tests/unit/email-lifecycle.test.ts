import { describe, expect, it } from "vitest";
import { appointmentEmailKind } from "@/server/email/lifecycle";

describe("authoritative appointment email mapping", () => {
  it("notifies on the final state and ignores intermediate or unsupported states", () => {
    expect(appointmentEmailKind("PENDING", false)).toBe("booking.request_received");
    expect(appointmentEmailKind("ACCEPTED", false)).toBeNull();
    expect(appointmentEmailKind("AWAITING_PAYMENT", false)).toBe("booking.payment_required");
    expect(appointmentEmailKind("DECLINED", false)).toBe("booking.declined");
    expect(appointmentEmailKind("PAYMENT_EXPIRED", false)).toBe("booking.payment_expired");
    expect(appointmentEmailKind("CANCELLED", false)).toBe("booking.cancelled");
    expect(appointmentEmailKind("COMPLETED", false)).toBeNull();
  });

  it("sends payment-confirmed copy only when verified settlement exists", () => {
    expect(appointmentEmailKind("CONFIRMED", false)).toBe("booking.confirmed");
    expect(appointmentEmailKind("CONFIRMED", true)).toBe("booking.payment_confirmed");
  });
});
