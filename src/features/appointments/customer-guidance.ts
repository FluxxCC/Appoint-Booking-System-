import type { Database } from "@/types/database.generated";

type State = Database["public"]["Enums"]["appointment_state"];

export function bookingGuidance(state: State): string {
  switch (state) {
    case "PENDING": return "This request is waiting for approval. The time is not reserved yet.";
    case "AWAITING_PAYMENT": return "Your time is reserved during the payment window. Contact the business for payment instructions.";
    case "CONFIRMED": return "Your appointment is confirmed and the time is reserved.";
    case "DECLINED": return "This request was declined. Contact the business if you need help choosing another time.";
    case "PAYMENT_EXPIRED": return "The payment window expired and this time is no longer reserved. Contact the business for help.";
    case "CANCELLED": return "This appointment was cancelled and the time is no longer reserved.";
    default: return "Contact the business if you need help with this appointment.";
  }
}
