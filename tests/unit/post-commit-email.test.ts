import { beforeEach, describe, expect, it, vi } from "vitest";

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock("@/server/email/outbox.server", () => ({ dispatchNotificationOutbox: dispatch }));

import { dispatchNotificationsAfterCommit } from "@/server/email/post-commit.server";

describe("post-commit notification dispatch", () => {
  beforeEach(() => {
    dispatch.mockReset();
  });

  it("attempts one bounded pass through the canonical dispatcher after commit", async () => {
    dispatch.mockResolvedValue({ claimed: 1, delivered: 1, retrying: 0, failed: 0 });

    await dispatchNotificationsAfterCommit();
    expect(dispatch).toHaveBeenCalledWith(5);
  });

  it("contains dispatcher failure so committed operations remain successful", async () => {
    dispatch.mockRejectedValue(new Error("private provider or database detail"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(dispatchNotificationsAfterCommit()).resolves.toBeUndefined();
    expect(warning).toHaveBeenCalled();
    expect(warning.mock.calls.flat().join(" ")).not.toContain("private provider or database detail");
    warning.mockRestore();
  });

  it("records safe incomplete-delivery telemetry without exposing details", async () => {
    dispatch.mockResolvedValue({ claimed: 1, delivered: 0, retrying: 1, failed: 0 });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await dispatchNotificationsAfterCommit();
    expect(warning).toHaveBeenCalledWith("[email-outbox] Immediate delivery was incomplete.", { claimed: 1, delivered: 0, retrying: 1, failed: 0 });
    warning.mockRestore();
  });
});
