import { describe, expect, it } from "vitest";
import {
  canAccessPaymentAppointment,
  CheckoutPreparationError,
  paymentReturnDisposition,
  prepareCheckoutDecision,
  type AppointmentPaymentSnapshot,
  type PaymentAccessProof,
} from "../../src/lib/payments/checkout";

const now = new Date("2026-10-03T04:00:00.000Z");
const appointment: AppointmentPaymentSnapshot = {
  id: "appointment-1", customerId: "customer-1", state: "AWAITING_PAYMENT",
  paymentMode: "DEPOSIT", acceptedAt: "2026-10-03T03:00:00.000Z",
  requiredPaymentAmount: 12500, totalAmount: 50000, currency: "PHP",
  paymentDueAt: "2026-10-03T05:00:00.000Z", paidAmount: 0,
};
const customerProof: PaymentAccessProof = {
  kind: "customer", authUserId: "user-1", customerAuthUserId: "user-1",
  customerId: "customer-1", appointmentCustomerId: "customer-1", active: true,
};
const guestProof: PaymentAccessProof = {
  kind: "guest", appointmentId: "appointment-1", scope: "VIEW",
  expiresAt: "2026-10-04T04:00:00.000Z", consumedAt: null, revokedAt: null,
};

describe("payment checkout preparation", () => {
  it("authorizes only the registered customer linked to the appointment", () => {
    expect(canAccessPaymentAppointment(appointment.id, appointment.customerId, customerProof, now)).toBe(true);
    expect(canAccessPaymentAppointment(appointment.id, appointment.customerId, {
      ...customerProof, authUserId: "other-user",
    }, now)).toBe(false);
    expect(canAccessPaymentAppointment(appointment.id, appointment.customerId, {
      ...customerProof, customerId: "other-customer", appointmentCustomerId: "other-customer",
    }, now)).toBe(false);
    expect(canAccessPaymentAppointment(appointment.id, appointment.customerId, {
      ...customerProof, active: false,
    }, now)).toBe(false);
  });

  it("authorizes an unexpired scoped guest token only for its appointment", () => {
    expect(canAccessPaymentAppointment(appointment.id, appointment.customerId, guestProof, now)).toBe(true);
    expect(canAccessPaymentAppointment("another-appointment", appointment.customerId, guestProof, now)).toBe(false);
    expect(canAccessPaymentAppointment(appointment.id, appointment.customerId, { ...guestProof, scope: "MANAGE" }, now)).toBe(false);
    expect(canAccessPaymentAppointment(appointment.id, appointment.customerId, { ...guestProof, expiresAt: now.toISOString() }, now)).toBe(false);
    expect(canAccessPaymentAppointment(appointment.id, appointment.customerId, { ...guestProof, revokedAt: now.toISOString() }, now)).toBe(false);
    expect(canAccessPaymentAppointment(appointment.id, appointment.customerId, { ...guestProof, consumedAt: now.toISOString() }, now)).toBe(false);
  });

  it("derives amount, currency, and deadline from the trusted appointment snapshot", () => {
    expect(prepareCheckoutDecision({ appointment, authorized: true, existingPending: null, idempotencyKey: "server-key", providerConfigured: true, now })).toEqual({
      kind: "create", appointmentId: appointment.id, amountMinor: 12500, currency: "PHP",
      deadline: appointment.paymentDueAt, idempotencyKey: "server-key",
    });
  });

  it("rejects unauthorized, expired, paid, invalid-state, or unconfigured checkout", () => {
    const reject = (patch: Partial<AppointmentPaymentSnapshot>, authorized = true, providerConfigured = true) =>
      prepareCheckoutDecision({ appointment: { ...appointment, ...patch }, authorized, existingPending: null, idempotencyKey: "server-key", providerConfigured, now });
    expect(() => reject({}, false)).toThrow(CheckoutPreparationError);
    expect(() => reject({ paymentDueAt: "2026-10-03T03:59:00.000Z" })).toThrow(/deadline/);
    expect(() => reject({ paidAmount: 12500 })).toThrow(/outstanding/);
    expect(() => reject({ state: "CONFIRMED" })).toThrow(/not awaiting/);
    expect(() => reject({}, true, false)).toThrow(/not configured/);
  });

  it("reuses the same active pending attempt and idempotency key", () => {
    expect(prepareCheckoutDecision({
      appointment, authorized: true,
      existingPending: { id: "payment-1", appointmentId: appointment.id, state: "PENDING", idempotencyKey: "persisted-key" },
      idempotencyKey: "new-key-must-not-be-used", providerConfigured: true, now,
    })).toEqual({ kind: "reuse", paymentId: "payment-1", idempotencyKey: "persisted-key" });
  });

  it("never treats browser return parameters as proof of payment", () => {
    expect(paymentReturnDisposition(new URLSearchParams("paid=true&status=success"))).toBe("CHECKING_PAYMENT");
  });
});
