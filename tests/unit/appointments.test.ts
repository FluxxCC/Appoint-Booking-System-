import { describe, expect, it } from "vitest";
import { blocksSlot, canTransition, stateAfterAcceptance } from "../../src/features/appointments/state-machine";
import { formatMoney } from "../../src/lib/money";
import { appointmentStatus } from "../../src/features/appointments/customer-status";

describe("approval before payment", () => {
  it("never skips approval", () => {
    expect(canTransition("PENDING", "CONFIRMED")).toBe(false);
    expect(canTransition("PENDING", "AWAITING_PAYMENT")).toBe(false);
    expect(blocksSlot("PENDING")).toBe(false);
    expect(blocksSlot("ACCEPTED")).toBe(true);
  });
  it("branches by payment requirement", () => {
    expect(stateAfterAcceptance("PAY_AT_BUSINESS")).toBe("CONFIRMED");
    expect(stateAfterAcceptance("DEPOSIT")).toBe("AWAITING_PAYMENT");
    expect(stateAfterAcceptance("FULL_PAYMENT")).toBe("AWAITING_PAYMENT");
  });
  it("releases expiration but preserves historical intervals", () => {
    expect(blocksSlot("PAYMENT_EXPIRED")).toBe(false);
    expect(blocksSlot("COMPLETED")).toBe(true);
    expect(blocksSlot("NO_SHOW")).toBe(true);
    expect(canTransition("PAYMENT_EXPIRED", "CONFIRMED")).toBe(false);
  });
  it("handles currency exponents", () => {
    expect(formatMoney(1234, "USD", "en-US")).toBe("$12.34");
    expect(formatMoney(1234, "JPY", "en-US")).toBe("¥1,234");
    expect(() => formatMoney(1.5, "USD")).toThrow();
  });
  it("presents internal lifecycle states in customer language", () => {
    expect(appointmentStatus("PENDING")).toBe("Waiting for approval");
    expect(appointmentStatus("AWAITING_PAYMENT")).toBe("Payment required");
    expect(appointmentStatus("PAYMENT_EXPIRED")).toBe("Payment window expired");
    expect(appointmentStatus("COMPLETED")).toBe("Completed");
  });
});
