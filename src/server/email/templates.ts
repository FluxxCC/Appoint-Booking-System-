import "server-only";

import { formatMoney } from "@/lib/money";
import { formatBusinessTime } from "@/lib/time";
import type { TransactionalEmail, TransactionalEmailKind } from "./types";

export type EmailBusiness = { name: string; contactEmail?: string | null; contactPhone?: string | null };
export type AppointmentEmailDetails = {
  to: string;
  kind: Extract<TransactionalEmailKind, `booking.${string}` | "business.new_booking" | "business.payment_exception">;
  reference: string;
  serviceName: string;
  staffName: string;
  startsAt: string;
  timezone: string;
  business: EmailBusiness;
  amountMinor?: number;
  currency?: string;
  paymentDueAt?: string | null;
  declineReason?: string;
  ctaUrl?: string;
  idempotencyKey: string;
};

const copy = {
  "booking.request_received": {
    subject: "We received your booking request",
    lead: "Your appointment request has been received and is waiting for review.",
  },
  "booking.declined": {
    subject: "An update about your appointment request",
    lead: "We’re unable to accommodate this appointment request. Contact the business if you need help.",
  },
  "booking.payment_required": {
    subject: "Your appointment was accepted — payment required",
    lead: "Your appointment was accepted and the requested time is reserved while payment is completed.",
  },
  "booking.payment_confirmed": {
    subject: "Your appointment payment is confirmed",
    lead: "Your payment was verified and your appointment is confirmed.",
  },
  "booking.confirmed": {
    subject: "Your appointment is confirmed",
    lead: "Your appointment is confirmed.",
  },
  "booking.cancelled": {
    subject: "Your appointment was cancelled",
    lead: "Your appointment has been cancelled. Contact the business if you have questions.",
  },
  "booking.payment_expired": {
    subject: "Your appointment payment window has ended",
    lead: "The payment deadline passed before payment was confirmed, so the appointment reservation has expired.",
  },
  "booking.guest_access": {
    subject: "Your private booking link",
    lead: "Use the secure link below to open your guest booking. This link is private and expires shortly.",
  },
  "business.new_booking": {
    subject: "A booking request needs your review",
    lead: "A new appointment request is assigned to you for review.",
  },
  "business.payment_exception": {
    subject: "A payment needs business review",
    lead: "A payment was received outside the appointment’s valid payment window and needs review.",
  },
} satisfies Record<AppointmentEmailDetails["kind"], { subject: string; lead: string }>;

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function emailLayout(businessName: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#f5f7f8;font-family:Arial,sans-serif;color:#17212b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #e2e8ec;border-radius:16px"><tr><td style="padding:32px"><p style="margin:0 0 20px;color:#006d67;font-weight:700">${escapeHtml(businessName)}</p>${body}<hr style="border:0;border-top:1px solid #e2e8ec;margin:28px 0 16px"><p style="margin:0;color:#687783;font-size:12px">This is a transactional message about an appointment. Please contact the business if you need assistance.</p></td></tr></table></td></tr></table></body></html>`;
}

export function renderAppointmentEmail(input: AppointmentEmailDetails): TransactionalEmail {
  const details = [
    ["Booking reference", input.reference],
    ["Service", input.serviceName],
    ["Professional", input.staffName],
    ["Appointment", formatBusinessTime(input.startsAt, input.timezone)],
  ] as const;
  const dataRows = details.map(([label, value]) => `<tr><th align="left" style="padding:6px 16px 6px 0;color:#687783;font-weight:400">${label}</th><td style="padding:6px 0;font-weight:600">${escapeHtml(value)}</td></tr>`).join("");
  const paymentRows = input.amountMinor !== undefined && input.currency
    ? `<tr><th align="left" style="padding:6px 16px 6px 0;color:#687783;font-weight:400">${input.kind === "booking.payment_confirmed" ? "Amount paid" : input.kind === "business.payment_exception" ? "Payment amount" : "Payment required"}</th><td style="padding:6px 0;font-weight:600">${escapeHtml(formatMoney(input.amountMinor, input.currency))}</td></tr>${input.paymentDueAt ? `<tr><th align="left" style="padding:6px 16px 6px 0;color:#687783;font-weight:400">Payment deadline</th><td style="padding:6px 0;font-weight:600">${escapeHtml(formatBusinessTime(input.paymentDueAt, input.timezone))}</td></tr>` : ""}`
    : "";
  const message = copy[input.kind];
  const businessContact = [input.business.contactEmail, input.business.contactPhone].filter(Boolean).join(" · ");
  const contactLine = businessContact ? `<p style="margin:22px 0 0;color:#687783;font-size:14px">Need help? ${escapeHtml(businessContact)}</p>` : "";
  const cta = input.ctaUrl
    ? `<p style="margin:24px 0"><a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;padding:12px 18px;background:#006d67;border-radius:8px;color:#fff;text-decoration:none;font-weight:700">${input.kind === "business.new_booking" ? "Review assigned requests" : input.kind === "booking.guest_access" ? "Open private booking" : "View appointment"}</a></p>`
    : "";
  const textRows = details.map(([label, value]) => `${label}: ${value}`).join("\n");
  const textPayment = input.amountMinor !== undefined && input.currency
    ? `\n${input.kind === "booking.payment_confirmed" ? "Amount paid" : input.kind === "business.payment_exception" ? "Payment amount" : "Payment required"}: ${formatMoney(input.amountMinor, input.currency)}${input.paymentDueAt ? `\nPayment deadline: ${formatBusinessTime(input.paymentDueAt, input.timezone)}` : ""}`
    : "";
  return {
    kind: input.kind,
    to: input.to,
    subject: message.subject,
    text: `${message.lead}${input.declineReason ? `\n\nReason: ${input.declineReason}` : ""}\n\n${textRows}${textPayment}${input.ctaUrl ? `\n\nOpen: ${input.ctaUrl}` : ""}${businessContact ? `\n\nNeed help? ${businessContact}` : ""}`,
    html: emailLayout(input.business.name, `<h1 style="font-size:24px;line-height:1.3;margin:0 0 14px">${escapeHtml(message.subject)}</h1><p style="font-size:16px;line-height:1.6;margin:0 0 20px">${escapeHtml(message.lead)}</p>${input.declineReason ? `<p style="font-size:15px;line-height:1.6"><strong>Reason:</strong> ${escapeHtml(input.declineReason)}</p>` : ""}<table role="presentation" cellspacing="0" cellpadding="0">${dataRows}${paymentRows}</table>${cta}${contactLine}`),
    idempotencyKey: input.idempotencyKey,
  };
}

export function renderGuestAccessEmail(input: { to: string; reference: string; bookingUrl: string; businessName: string }): TransactionalEmail {
  const subject = "Your private booking link";
  const lead = "Use this secure, one-time link to open your guest booking. The link expires in 15 minutes. Do not forward it.";
  return {
    kind: "booking.guest_access",
    to: input.to,
    subject,
    text: `${lead}\n\nBooking reference is ${input.reference}\n\nOpen your private booking: ${input.bookingUrl}`,
    html: emailLayout(input.businessName, `<h1 style="font-size:24px;line-height:1.3;margin:0 0 14px">${escapeHtml(subject)}</h1><p style="font-size:16px;line-height:1.6">${escapeHtml(lead)}</p><p style="font-size:14px">Booking reference: <strong>${escapeHtml(input.reference)}</strong></p><p style="margin:24px 0"><a href="${escapeHtml(input.bookingUrl)}" style="display:inline-block;padding:12px 18px;background:#006d67;border-radius:8px;color:#fff;text-decoration:none;font-weight:700">Open private booking</a></p>`),
  };
}
