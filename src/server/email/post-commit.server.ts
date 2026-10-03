import "server-only";

import { after } from "next/server";
import { dispatchNotificationOutbox } from "./outbox.server";

const IMMEDIATE_BATCH_SIZE = 5;

/** Schedule a small, best-effort outbox pass after the authoritative write commits. */
export function dispatchNotificationsAfterCommit() {
  try {
    after(async () => {
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
        // The committed outbox row remains available to a later retry pass.
        console.warn("[email-outbox] Immediate dispatch was unavailable.");
      }
    });
  } catch {
    // Scheduling is best-effort too; never turn a committed business write into a failure.
    console.warn("[email-outbox] Immediate dispatch could not be scheduled.");
  }
}
