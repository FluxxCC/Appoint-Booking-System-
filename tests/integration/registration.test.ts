import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signUp: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { signUp: mocks.signUp }, rpc: mocks.rpc }) }));
vi.mock("@/lib/auth/access.server", () => ({ requireArea: vi.fn(), redirectAfterLogin: vi.fn() }));
vi.mock("@/lib/auth/site-url.server", () => ({ siteUrl: () => "https://business.example" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
import { registerAction } from "../../src/features/auth/actions";

function form() {
  const value = new FormData();
  for (const [name, content] of Object.entries({ fullName: "Jane Customer", email: "jane@example.com", phone: "+639171234567", password: "unique long passphrase", role: "OWNER", userId: "attacker-selected" })) value.set(name, content);
  return value;
}
beforeEach(() => { vi.clearAllMocks(); mocks.signUp.mockResolvedValue({ data: { session: null }, error: null }); mocks.rpc.mockImplementation(async (name:string)=>name==="registration_enabled"?{data:true,error:null}:{error:null}); });
it("strips privileged fields from the actual signup payload", async () => {
  const result = await registerAction({}, form());
  expect(result.success).toContain("Check your email");
  expect(mocks.signUp).toHaveBeenCalledWith({ email: "jane@example.com", password: "unique long passphrase", options: { emailRedirectTo: "https://business.example/auth/callback", data: { full_name: "Jane Customer", phone: "+639171234567" } } });
  expect(mocks.rpc).toHaveBeenCalledWith("registration_enabled");
  expect(mocks.rpc).not.toHaveBeenCalledWith("complete_customer_profile", expect.anything());
});
it("creates only the session-owned customer when email verification is disabled", async () => {
  mocks.signUp.mockResolvedValue({ data: { session: { user: {} } }, error: null });
  await expect(registerAction({}, form())).rejects.toThrow("REDIRECT:/account");
  expect(mocks.rpc).toHaveBeenCalledWith("complete_customer_profile", { p_name: "Jane Customer", p_phone: "+639171234567" });
});
it("does not sign up when registration is disabled or cannot be checked", async () => {
  mocks.rpc.mockResolvedValue({data:false,error:null});
  expect((await registerAction({},form())).error).toContain("unavailable");
  expect(mocks.signUp).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValue({data:null,error:{message:"connection failure"}});
  expect((await registerAction({},form())).error).toContain("unavailable");
  expect(mocks.signUp).not.toHaveBeenCalled();
});
it("rejects weak input without calling Auth", async () => {
  const input = form(); input.set("password", "short");
  expect((await registerAction({}, input)).fieldErrors?.password).toBeDefined();
  expect(mocks.signUp).not.toHaveBeenCalled();
});
