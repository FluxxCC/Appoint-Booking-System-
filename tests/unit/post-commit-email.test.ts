import { beforeEach, describe, expect, it, vi } from "vitest";

const { dispatch, clientFactory } = vi.hoisted(() => ({ dispatch: vi.fn(), clientFactory: vi.fn() }));
vi.mock("@/server/email/outbox.server", () => ({ dispatchNotificationOutbox: dispatch }));
vi.mock("@/lib/supabase/privileged.server", () => ({ createPrivilegedClient: clientFactory }));

import { dispatchNotificationsAfterCommit } from "@/server/email/post-commit.server";

describe("post-commit notification dispatch", () => {
  beforeEach(() => {
    dispatch.mockReset();
    clientFactory.mockReset();
  });

  it("claims only the new operation's outbox key after commit", async () => {
    dispatch.mockResolvedValue({ claimed: 1, delivered: 1, retrying: 0, failed: 0, skipped: 0 });

    await dispatchNotificationsAfterCommit({ outboxKey: "guest-access:test-request" });
    expect(dispatch).toHaveBeenCalledWith(1, "guest-access:test-request");
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("resolves the exact lifecycle event for an appointment transition", async () => {
    const event = { id: "44444444-4444-4444-8444-444444444444" };
    const maybeSingle = vi.fn().mockResolvedValue({ data: event, error: null });
    const builder = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle };
    builder.select.mockReturnValue(builder); builder.eq.mockReturnValue(builder);
    builder.order.mockReturnValue(builder); builder.limit.mockReturnValue(builder);
    clientFactory.mockReturnValue({ from: vi.fn().mockReturnValue(builder) });
    dispatch.mockResolvedValue({ claimed: 1, delivered: 1, retrying: 0, failed: 0, skipped: 0 });

    await dispatchNotificationsAfterCommit({ appointmentId: "11111111-1111-4111-8111-111111111111", eventState: "AWAITING_PAYMENT" });
    expect(builder.eq).toHaveBeenCalledWith("to_state", "AWAITING_PAYMENT");
    expect(dispatch).toHaveBeenCalledWith(1, event.id);
  });

  it("contains dispatcher failure so committed operations remain successful", async () => {
    dispatch.mockRejectedValue(new Error("private provider or database detail"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(dispatchNotificationsAfterCommit({ outboxKey: "event-id" })).resolves.toBeUndefined();
    expect(warning).toHaveBeenCalled();
    expect(warning.mock.calls.flat().join(" ")).not.toContain("private provider or database detail");
    warning.mockRestore();
  });

  it("records safe incomplete-delivery telemetry without exposing details", async () => {
    dispatch.mockResolvedValue({ claimed: 1, delivered: 0, retrying: 1, failed: 0, skipped: 0 });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await dispatchNotificationsAfterCommit({ outboxKey: "event-id" });
    expect(warning).toHaveBeenCalledWith("[email-outbox] Immediate delivery was incomplete.", { claimed: 1, delivered: 0, retrying: 1, failed: 0, skipped: 0 });
    warning.mockRestore();
  });
});
