import { describe, expect, it } from "vitest";
import { accessDecision, landingPath, safeAuthDestination, type Principal } from "../../src/lib/auth/access";
import { registrationSchema, resetSchema } from "../../src/features/auth/schemas";

const customer: Principal = { userId: "customer", email: "test@example.com", profileActive: true, staffActive: false, roles: [], aal: "aal1" };
describe("workspace authorization", () => {
  it("rejects unauthenticated access", () => {
    for (const area of ["admin", "staff", "account"] as const) expect(accessDecision(null, area)).toBe("login");
  });
  it("restricts ordinary customers", () => {
    expect(accessDecision(customer, "admin")).toBe("denied");
    expect(accessDecision(customer, "staff")).toBe("denied");
    expect(accessDecision(customer, "account")).toBe("allow");
  });
  it("restricts staff and checks their active link", () => {
    const staff: Principal = { ...customer, roles: ["STAFF"], staffActive: true };
    expect(accessDecision(staff, "admin")).toBe("denied");
    expect(accessDecision(staff, "staff")).toBe("allow");
    expect(accessDecision({ ...staff, staffActive: false }, "staff")).toBe("denied");
    expect(accessDecision({ ...staff, profileActive: false }, "staff")).toBe("denied");
  });
  it("requires admin MFA and respects role priority", () => {
    const admin: Principal = { ...customer, roles: ["STAFF", "ADMIN"], staffActive: true };
    expect(accessDecision(admin, "admin")).toBe("mfa");
    expect(landingPath(admin)).toBe("/auth/mfa");
    expect(accessDecision({ ...admin, aal: "aal2" }, "admin")).toBe("allow");
    expect(landingPath({ ...admin, aal: "aal2" })).toBe("/admin");
    expect(landingPath(customer)).toBe("/account");
  });
  it("requires OWNER AAL2 for /admin and allows privileged access after MFA", () => {
    const owner: Principal = { ...customer, roles: ["OWNER"] };
    expect(accessDecision(owner, "admin")).toBe("mfa");
    expect(landingPath(owner)).toBe("/auth/mfa");
    expect(accessDecision({ ...owner, aal: "aal2" }, "admin")).toBe("allow");
    expect(landingPath({ ...owner, aal: "aal2" })).toBe("/admin");
  });
  it("rejects external and encoded redirect destinations", () => {
    for (const path of ["https://evil.test", "//evil.test", "/\\evil.test", "%2f%2fevil.test", "/admin?next=evil", undefined]) expect(safeAuthDestination(path)).toBe("/account");
    expect(safeAuthDestination("/reset-password")).toBe("/reset-password");
  });
});

describe("customer inputs", () => {
  const registration = { fullName: "Test Customer", email: "test@example.com", password: "a long unique passphrase", phone: "" };
  it("does not accept a role or authority field", () => {
    expect(registrationSchema.safeParse(registration).success).toBe(true);
    expect(registrationSchema.safeParse({ ...registration, role: "OWNER" }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...registration, userId: "other" }).success).toBe(false);
  });
  it("rejects weak passwords, malformed contacts and mismatched reset", () => {
    expect(registrationSchema.safeParse({ ...registration, password: "short" }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...registration, email: "invalid" }).success).toBe(false);
    expect(resetSchema.safeParse({ password: registration.password, confirmPassword: "different" }).success).toBe(false);
  });
});
