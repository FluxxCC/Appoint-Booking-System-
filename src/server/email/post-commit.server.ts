import "server-only";

import { createPrivilegedClient } from "@/lib/supabase/privileged.server";
import type { Database } from "@/types/database.generated";
import { dispatchNotificationOutbox } from "./outbox.server";

type AppointmentState = Database["public"]["Enums"]["appointment_state"];
export type NotificationScope = { appointmentId: string; eventState?: AppointmentState } | { outboxKey: string };

async function outboxKeyForOperation(scope: NotificationScope): Promise<string | null> {
  if ("outboxKey" in scope) return scope.outboxKey;
  const client = createPrivilegedClient();
  let state = scope.eventState;
  if (!state) {
    const { data: appointment, error } = await client.from("appointments")
      .select("state").eq("id", scope.appointmentId).maybeSingle();
    if (error || !appointment) throw new Error("Appointment notification scope is unavailable.");
    state = appointment.state;
  }
  const { data: event, error } = await client.from("appointment_events")
    .select("id").eq("appointment_id", scope.appointmentId).eq("to_state", state)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("Appointment notification scope is unavailable.");
  return event?.id ?? null;
}

/** Attempt only this operation's event after its authoritative write commits. */
export async function dispatchNotificationsAfterCommit(scope: NotificationScope) {
  try {
    const key = await outboxKeyForOperation(scope);
    if (!key) return;
    const result = await dispatchNotificationOutbox(1, key);
    if (result.retrying || result.failed) {
      console.warn("[email-outbox] Immediate delivery was incomplete.", {
        claimed: result.claimed, delivered: result.delivered,
        retrying: result.retrying, failed: result.failed, skipped: result.skipped,
      });
    }
  } catch {
    // The database transaction has already committed. Never turn delivery failure into
    // a failed booking, appointment transition, or verified payment operation.
    console.warn("[email-outbox] Immediate dispatch was unavailable.");
  }
}
