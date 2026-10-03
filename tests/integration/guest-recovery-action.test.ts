import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  dispatch: vi.fn(),
  consumeRateLimit: vi.fn(),
  trustedClientIdentifier: vi.fn(() => "ip:test"),
  headers: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/features/availability/rate-limit.server", () => ({ consumeRateLimit: mocks.consumeRateLimit, trustedClientIdentifier: mocks.trustedClientIdentifier }));
vi.mock("@/lib/supabase/privileged.server", () => ({ createPrivilegedClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/server/email/post-commit.server", () => ({ dispatchNotificationsAfterCommit: mocks.dispatch }));

import { requestGuestRecoveryAction } from "@/features/public-site/recovery-actions";

function form() {
  const value = new FormData();
  value.set("email", "guest@example.test");
  value.set("reference", "BK-0123456789ABCDEF");
  return value;
}

describe("guest email recovery delivery", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.dispatch.mockReset();
    mocks.consumeRateLimit.mockReset().mockResolvedValue({ allowed: true, retryAfterSeconds: 60 });
    mocks.headers.mockResolvedValue(new Headers({ "x-real-ip": "192.0.2.10" }));
  });

  it("keeps a generic response and does not dispatch unrelated mail for unmatched details", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    const result = await requestGuestRecoveryAction({}, form());
    expect(result.success).toMatch(/If those details match/i);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("dispatches the queued recovery email only after a trusted booking match", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const result = await requestGuestRecoveryAction({}, form());
    expect(result.success).toMatch(/If those details match/i);
    expect(mocks.dispatch).toHaveBeenCalledOnce();
  });

  it("keeps recovery rate limited before touching Supabase", async () => {
    mocks.consumeRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
    const result = await requestGuestRecoveryAction({}, form());
    expect(result.error).toContain("Too many requests");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});
