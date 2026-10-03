import type { Database } from "@/types/database.generated";
import type { TransactionalEmailKind } from "./types";

type AppointmentState = Database["public"]["Enums"]["appointment_state"];

/** Maps committed appointment states to customer-facing transactional messages. */
export function appointmentEmailKind(state: AppointmentState, hasVerifiedPayment: boolean): TransactionalEmailKind | null {
  if (state === "PENDING") return "booking.request_received";
  if (state === "DECLINED") return "booking.declined";
  if (state === "AWAITING_PAYMENT") return "booking.payment_required";
  if (state === "PAYMENT_EXPIRED") return "booking.payment_expired";
  if (state === "CANCELLED") return "booking.cancelled";
  if (state === "CONFIRMED") return hasVerifiedPayment ? "booking.payment_confirmed" : "booking.confirmed";

  // ACCEPTED is an intermediate state committed with AWAITING_PAYMENT or
  // CONFIRMED, so the final event sends the relevant customer notification.
  return null;
}
