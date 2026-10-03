import { beforeEach, describe, expect, it, vi } from "vitest";

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock("@/server/email/outbox.server", () => ({ dispatchNotificationOutbox: dispatch }));

import { GET } from "@/app/api/cron/notifications/route";

describe("notification cron endpoint", () => {
  beforeEach(() => {
    dispatch.mockReset();
    process.env.CRON_SECRET = "unit-test-cron-secret";
  });

  it("rejects calls without the server-only bearer secret", async () => {
    const response = await GET(new Request("https://example.test/api/cron/notifications"));
    expect(response.status).toBe(401);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("dispatches only after constant-time secret validation", async () => {
    dispatch.mockResolvedValue({ claimed: 2, delivered: 2, retrying: 0, failed: 0 });
    const response = await GET(new Request("https://example.test/api/cron/notifications", {
      headers: { authorization: "Bearer unit-test-cron-secret" },
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ claimed: 2, delivered: 2, retrying: 0, failed: 0 });
    expect(dispatch).toHaveBeenCalledWith(20);
  });
});
