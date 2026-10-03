export const appointmentStates = [
  "PENDING", "DECLINED", "ACCEPTED", "AWAITING_PAYMENT", "PAYMENT_EXPIRED",
  "CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW",
] as const;
export type AppointmentState = typeof appointmentStates[number];
export type PaymentMode = "PAY_AT_BUSINESS" | "DEPOSIT" | "FULL_PAYMENT";

const transitions: Record<AppointmentState, readonly AppointmentState[]> = {
  PENDING: ["DECLINED", "ACCEPTED", "CANCELLED"],
  ACCEPTED: ["CONFIRMED", "AWAITING_PAYMENT"],
  AWAITING_PAYMENT: ["CONFIRMED", "PAYMENT_EXPIRED", "CANCELLED"],
  CONFIRMED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"],
  CHECKED_IN: ["IN_PROGRESS"], IN_PROGRESS: ["COMPLETED"],
  DECLINED: [], PAYMENT_EXPIRED: [], COMPLETED: [], CANCELLED: [], NO_SHOW: [],
};
export function canTransition(from: AppointmentState, to: AppointmentState) {
  return transitions[from].includes(to);
}
export function stateAfterAcceptance(mode: PaymentMode): AppointmentState {
  return mode === "PAY_AT_BUSINESS" ? "CONFIRMED" : "AWAITING_PAYMENT";
}
export function blocksSlot(state: AppointmentState) {
  return (["ACCEPTED", "AWAITING_PAYMENT", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED", "NO_SHOW"] as AppointmentState[]).includes(state);
}
