import type { Database } from "@/types/database.generated";
type State=Database["public"]["Enums"]["appointment_state"];
const labels:Record<State,string>={PENDING:"Waiting for approval",DECLINED:"Declined",ACCEPTED:"Accepted",AWAITING_PAYMENT:"Payment required",PAYMENT_EXPIRED:"Payment window expired",CONFIRMED:"Confirmed",CHECKED_IN:"Checked in",IN_PROGRESS:"In progress",COMPLETED:"Completed",CANCELLED:"Cancelled",NO_SHOW:"No-show"};
export function appointmentStatus(state:State){return labels[state]??"Appointment update"}
