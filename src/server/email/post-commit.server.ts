import "server-only";

import { dispatchNotificationOutbox } from "./outbox.server";

const IMMEDIATE_BATCH_SIZE = 5;

/** Attempt delivery only after the authoritative write has returned committed. */
export async function dispatchNotificationsAfterCommit() {
  try {
    const result = await dispatchNotificationOutbox(IMMEDIATE_BATCH_SIZE);
    if (result.retrying || result.failed) {
      console.warn("[email-outbox] Immediate delivery was incomplete.", {
        claimed: result.claimed,
        delivered: result.delivered,
        retrying: result.retrying,
        failed: result.failed,
      });
    }
  } catch {
    // The database transaction has already committed. Never turn delivery failure into
    // a failed booking, appointment transition, or verified payment operation.
    console.warn("[email-outbox] Immediate dispatch was unavailable.");
  }
}
