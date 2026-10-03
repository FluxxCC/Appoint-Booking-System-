import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), getClaims: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser, getClaims: mocks.getClaims }, rpc: mocks.rpc }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
import { requireArea, requireOwner } from "../../src/lib/auth/access.server";

beforeEach(() => {
  mocks.getUser.mockResolvedValue({ data: { user: { id: "verified-user", email: "user@example.com", email_confirmed_at: "2026-01-01", user_metadata: { role: "OWNER" } } }, error: null });
  mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "verified-user", aal: "aal1" } }, error: null });
  mocks.rpc.mockResolvedValue({ data: { profileActive: true, staffActive: false, roles: [] }, error: null });
});
describe("real server guard with mocked external Auth transport", () => {
  it("redirects missing or expired sessions", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });
    await expect(requireArea("account")).rejects.toThrow("REDIRECT:/login");
  });
  it("ignores editable metadata claiming OWNER", async () => {
    await expect(requireArea("admin")).rejects.toThrow("REDIRECT:/auth/access-denied");
    await expect(requireArea("staff")).rejects.toThrow("REDIRECT:/auth/access-denied");
  });
  it("fails closed when role lookup fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "offline" } });
    await expect(requireArea("admin")).rejects.toThrow("could not be checked");
  });
  it("fails closed on invalid role values", async () => {
    mocks.rpc.mockResolvedValue({ data: { profileActive: true, staffActive: true, roles: ["SUPERUSER"] }, error: null });
    await expect(requireArea("admin")).rejects.toThrow();
  });
  it("rejects disabled staff", async () => {
    mocks.rpc.mockResolvedValue({ data: { profileActive: true, staffActive: false, roles: ["STAFF"] }, error: null });
    await expect(requireArea("staff")).rejects.toThrow("REDIRECT:/auth/access-denied");
  });
  it("requires MFA before admitting an admin", async () => {
    mocks.rpc.mockResolvedValue({ data: { profileActive: true, staffActive: false, roles: ["ADMIN"] }, error: null });
    await expect(requireArea("admin")).rejects.toThrow("REDIRECT:/auth/mfa");
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "verified-user", aal: "aal2" } }, error: null });
    await expect(requireArea("admin")).resolves.toMatchObject({ principal: { roles: ["ADMIN"] } });
    await expect(requireOwner()).rejects.toThrow("REDIRECT:/auth/access-denied");
  });
  it("allows a verified owner with MFA", async () => {
    mocks.rpc.mockResolvedValue({ data: { profileActive: true, staffActive: false, roles: ["OWNER"] }, error: null });
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "verified-user", aal: "aal2" } }, error: null });
    await expect(requireOwner()).resolves.toMatchObject({ principal: { roles: ["OWNER"] } });
  });
});
