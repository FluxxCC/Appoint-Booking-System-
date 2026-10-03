import { describe, expect, it } from "vitest";
import { operationalRecipientScope, resolveCustomerEmail, resolveStaffEmail } from "@/server/email/recipients";

describe("transactional email recipient authorization", () => {
  it("uses only the linked confirmed Auth email for registered customers", () => {
    expect(resolveCustomerEmail({
      authUserId: "user-1", storedEmail: "browser@example.test", linkedAuthEmail: "verified@example.test",
      linkedAuthEmailConfirmed: true, linkedProfileActive: true,
    })).toEqual({ email: "verified@example.test", guest: false });
    expect(resolveCustomerEmail({
      authUserId: "user-1", storedEmail: "browser@example.test", linkedAuthEmail: "unverified@example.test",
      linkedAuthEmailConfirmed: false, linkedProfileActive: true,
    })).toBeNull();
    expect(resolveCustomerEmail({
      authUserId: "user-1", storedEmail: "browser@example.test", linkedAuthEmail: "verified@example.test",
      linkedAuthEmailConfirmed: true, linkedProfileActive: false,
    })).toBeNull();
  });

  it("uses only the trusted stored guest email and validates linked staff recipients", () => {
    expect(resolveCustomerEmail({ authUserId: null, storedEmail: " guest@example.test " }))
      .toEqual({ email: "guest@example.test", guest: true });
    expect(resolveCustomerEmail({ authUserId: null, storedEmail: "invalid" })).toBeNull();
    expect(resolveStaffEmail({
      authUserId: "staff-1", active: true, linkedAuthEmail: "staff@example.test",
      linkedAuthEmailConfirmed: true, linkedProfileActive: true,
    })).toBe("staff@example.test");
    expect(resolveStaffEmail({
      authUserId: "staff-1", active: false, linkedAuthEmail: "staff@example.test",
      linkedAuthEmailConfirmed: true, linkedProfileActive: true,
    })).toBeNull();
  });

  it("scopes operational notices to the selected approval mode", () => {
    expect(operationalRecipientScope("PENDING", "ADMIN_APPROVAL")).toBe("admin_ops");
    expect(operationalRecipientScope("PENDING", "STAFF_APPROVAL")).toBe("assigned_staff");
    expect(operationalRecipientScope("PENDING", "AUTO_CONFIRM")).toBeNull();
    expect(operationalRecipientScope("CONFIRMED", "ADMIN_APPROVAL")).toBeNull();
  });
});
