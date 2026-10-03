import { beforeEach, describe, expect, it, vi } from "vitest";

const { schedule, dispatch } = vi.hoisted(() => ({ schedule: vi.fn(), dispatch: vi.fn() }));
vi.mock("next/server", () => ({ after: schedule }));
vi.mock("@/server/email/outbox.server", () => ({ dispatchNotificationOutbox: dispatch }));

import { dispatchNotificationsAfterCommit } from "@/server/email/post-commit.server";

describe("post-commit notification dispatch", () => {
  beforeEach(() => {
    schedule.mockReset();
    dispatch.mockReset();
  });

  it("schedules one bounded pass through the canonical dispatcher", async () => {
    let callback: (() => Promise<void>) | undefined;
    schedule.mockImplementation((work: () => Promise<void>) => { callback = work; });
    dispatch.mockResolvedValue({ claimed: 1, delivered: 1, retrying: 0, failed: 0 });

    dispatchNotificationsAfterCommit();
    expect(schedule).toHaveBeenCalledOnce();
    expect(dispatch).not.toHaveBeenCalled();
    await callback?.();

    expect(dispatch).toHaveBeenCalledWith(5);
  });

  it("contains dispatcher failure so committed operations remain successful", async () => {
    let callback: (() => Promise<void>) | undefined;
    schedule.mockImplementation((work: () => Promise<void>) => { callback = work; });
    dispatch.mockRejectedValue(new Error("private provider or database detail"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() => dispatchNotificationsAfterCommit()).not.toThrow();
    await expect(callback?.()).resolves.toBeUndefined();
    expect(warning).toHaveBeenCalled();
    expect(warning.mock.calls.flat().join(" ")).not.toContain("private provider or database detail");
    warning.mockRestore();
  });

  it("contains a scheduling failure too", () => {
    schedule.mockImplementation(() => { throw new Error("request context unavailable"); });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(() => dispatchNotificationsAfterCommit()).not.toThrow();
    expect(dispatch).not.toHaveBeenCalled();
    warning.mockRestore();
  });
});
