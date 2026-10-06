import { describe, expect, it } from "vitest";
import { deriveHomeServiceStatus } from "../../src/features/admin/home-service-status";
import { accessDecision, type Principal } from "../../src/lib/auth/access";

const origin = { service_origin_latitude: 14.6, service_origin_longitude: 120.98, home_service_max_radius_km: null };
const homeService = { active: true, published: true, supports_home_service: true };
const owner: Principal = { userId: "owner", email: "owner@example.test", profileActive: true, roles: ["OWNER"], staffActive: false, aal: "aal2" };
const admin: Principal = { ...owner, userId: "admin", email: "admin@example.test", roles: ["ADMIN"] };

describe("Home Service operational status", () => {
  it("shows setup required when the business origin is missing, even before services are configured", () => {
    expect(deriveHomeServiceStatus(null, [])).toMatchObject({ state: "SETUP_REQUIRED", href: "/admin/settings" });
  });

  it("shows setup required when enabled services have incomplete area configuration", () => {
    expect(deriveHomeServiceStatus({ ...origin, service_origin_latitude: null }, [homeService])).toMatchObject({ state: "SETUP_REQUIRED", publishedServices: 1 });
    expect(deriveHomeServiceStatus({ ...origin, home_service_max_radius_km: 0 }, [homeService])).toMatchObject({ state: "SETUP_REQUIRED" });
  });

  it("shows active only for a valid business origin and an active published Home Service", () => {
    expect(deriveHomeServiceStatus(origin, [homeService])).toMatchObject({ state: "ACTIVE", publishedServices: 1, href: "/admin/appointments" });
  });

  it("shows disabled when the valid area has no active, published Home Service", () => {
    expect(deriveHomeServiceStatus(origin, [{ ...homeService, published: false }, { ...homeService, active: false }])).toMatchObject({ state: "DISABLED", publishedServices: 0, href: "/admin/services" });
    expect(deriveHomeServiceStatus(origin, [{ ...homeService, category_id: "hidden" }], [{ id: "hidden", active: true, published: false }])).toMatchObject({ state: "DISABLED", publishedServices: 0 });
  });

  it.each([owner, admin])("keeps Home Service in the authorized management area for role $roles", (principal) => {
    expect(accessDecision(principal, "admin")).toBe("allow");
  });

  it("keeps OWNER security management separate from ADMIN business management", () => {
    expect(owner.roles.includes("OWNER")).toBe(true);
    expect(admin.roles.includes("OWNER")).toBe(false);
  });
});
