export const transactionalEmailKinds = [
  "booking.request_received",
  "booking.declined",
  "booking.payment_required",
  "booking.payment_confirmed",
  "booking.confirmed",
  "booking.cancelled",
  "booking.payment_expired",
  "booking.guest_access",
  "business.new_booking",
  "business.payment_exception",
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
