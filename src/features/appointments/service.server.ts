import "server-only";
import { requireUser } from "@/lib/auth/require-user.server";
import { appointmentIdSchema, requestAppointmentSchema } from "./schemas";
import { dispatchNotificationsAfterCommit } from "@/server/email/post-commit.server";

/** Internal application services, not public Server Actions or guest endpoints. */
export async function requestAppointment(input: unknown) {
  const value = requestAppointmentSchema.parse(input);
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("request_appointment", {
    p_customer: value.customerId, p_staff: value.staffId, p_service: value.serviceId,
    p_start: value.startsAt, p_request_key: value.requestKey,
  });
  if (error) throw new Error("Unable to request this appointment", { cause: error });
  await dispatchNotificationsAfterCommit();
  return data;
}

export async function acceptAppointment(id: unknown) {
  const appointmentId = appointmentIdSchema.parse(id);
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("accept_appointment", { p_appointment: appointmentId });
  if (error) throw new Error("Unable to accept this appointment", { cause: error });
  await dispatchNotificationsAfterCommit();
  return data;
}
