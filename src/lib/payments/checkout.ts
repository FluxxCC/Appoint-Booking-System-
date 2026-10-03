/**
 * Provider-independent checkout decisions. Inputs must be loaded by trusted
 * server code; no browser-supplied amount, currency, payment state, or proof
 * object is authoritative.
 */

export type AppointmentPaymentSnapshot = {
  id: string;
  customerId: string;
  state: string;
  paymentMode: string;
  acceptedAt: string | null;
  requiredPaymentAmount: number;
  totalAmount: number;
  currency: string;
  paymentDueAt: string | null;
  paidAmount: number;
};

export type PaymentAccessProof =
  | {
      kind: "customer";
      authUserId: string;
      customerAuthUserId: string | null;
      customerId: string;
      appointmentCustomerId: string;
      active: boolean;
    }
  | {
      kind: "guest";
      appointmentId: string;
      scope: string;
      expiresAt: string;
      consumedAt: string | null;
      revokedAt: string | null;
    };

export type PendingPaymentAttempt = {
  id: string;
  appointmentId: string;
  state: string;
  idempotencyKey: string;
};

export type CheckoutDecision =
  | { kind: "reuse"; paymentId: string; idempotencyKey: string }
  | {
      kind: "create";
      appointmentId: string;
      amountMinor: number;
      currency: string;
      deadline: string;
      idempotencyKey: string;
    };

export class CheckoutPreparationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutPreparationError";
  }
}

export function canAccessPaymentAppointment(
  appointmentId: string,
  appointmentCustomerId: string,
  proof: PaymentAccessProof,
  now = new Date(),
): boolean {
  if (proof.kind === "customer") {
    return proof.active
      && proof.authUserId.length > 0
      && proof.customerAuthUserId === proof.authUserId
      && proof.customerId === appointmentCustomerId
      && proof.appointmentCustomerId === appointmentCustomerId;
  }

  return proof.appointmentId === appointmentId
    && proof.scope === "VIEW"
    && proof.consumedAt === null
    && proof.revokedAt === null
    && Number.isFinite(Date.parse(proof.expiresAt))
    && Date.parse(proof.expiresAt) > now.getTime();
}

/**
 * Derive the provider request from the trusted appointment snapshot. The
 * idempotency key must be generated and retained by server/database code.
 */
export function prepareCheckoutDecision(input: {
  appointment: AppointmentPaymentSnapshot;
  authorized: boolean;
  existingPending: PendingPaymentAttempt | null;
  idempotencyKey: string;
  providerConfigured: boolean;
  now?: Date;
}): CheckoutDecision {
  const { appointment, now = new Date() } = input;
  if (!input.authorized) throw new CheckoutPreparationError("Appointment access denied.");
  if (!input.providerConfigured) throw new CheckoutPreparationError("Online payment is not configured.");
  if (appointment.state !== "AWAITING_PAYMENT" || appointment.paymentMode === "PAY_AT_BUSINESS") {
    throw new CheckoutPreparationError("Appointment is not awaiting online payment.");
  }
  if (!appointment.acceptedAt || !appointment.paymentDueAt) {
    throw new CheckoutPreparationError("Appointment payment reservation is unavailable.");
  }
  const deadline = Date.parse(appointment.paymentDueAt);
  if (!Number.isFinite(deadline) || deadline <= now.getTime()) {
    throw new CheckoutPreparationError("Payment deadline has passed.");
  }
  if (!Number.isSafeInteger(appointment.requiredPaymentAmount) || appointment.requiredPaymentAmount <= 0
    || !Number.isSafeInteger(appointment.totalAmount) || appointment.totalAmount < appointment.requiredPaymentAmount
    || !Number.isSafeInteger(appointment.paidAmount) || appointment.paidAmount < 0
    || appointment.paidAmount >= appointment.requiredPaymentAmount) {
    throw new CheckoutPreparationError("Appointment has no valid outstanding payment.");
  }
  if (!/^[A-Z]{3}$/.test(appointment.currency)) {
    throw new CheckoutPreparationError("Appointment currency is invalid.");
  }

  const pending = input.existingPending;
  if (pending) {
    if (pending.appointmentId !== appointment.id || pending.state !== "PENDING") {
      throw new CheckoutPreparationError("Existing payment attempt is not reusable.");
    }
    return { kind: "reuse", paymentId: pending.id, idempotencyKey: pending.idempotencyKey };
  }
  if (!input.idempotencyKey) throw new CheckoutPreparationError("Checkout idempotency key is required.");
  return {
    kind: "create",
    appointmentId: appointment.id,
    amountMinor: appointment.requiredPaymentAmount - appointment.paidAmount,
    currency: appointment.currency,
    deadline: appointment.paymentDueAt,
    idempotencyKey: input.idempotencyKey,
  };
}

/** Browser redirects are informational only; only verified server events settle payments. */
export function paymentReturnDisposition(query: URLSearchParams): "CHECKING_PAYMENT" {
  void query;
  return "CHECKING_PAYMENT";
}
