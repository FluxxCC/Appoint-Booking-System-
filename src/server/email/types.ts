export const transactionalEmailKinds = [
  "auth.account_invitation",
  "auth.password_setup",
  "auth.password_recovery",
  "booking.request_received",
  "booking.accepted",
  "booking.declined",
  "booking.payment_required",
  "booking.confirmed",
  "booking.cancelled",
  "booking.reminder",
  "booking.reschedule_proposal",
  "business.new_booking",
  "business.cancellation",
  "business.daily_summary",
] as const;

export type TransactionalEmailKind = (typeof transactionalEmailKinds)[number];

export type TransactionalEmail = {
  kind: TransactionalEmailKind;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  idempotencyKey?: string;
};

export type EmailDeliveryResult =
  | { ok: true; id: string }
  | { ok: false; code: "not_configured" | "invalid_input" | "provider_error" | "network_error"; retryable: boolean };
