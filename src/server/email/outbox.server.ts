import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { createPrivilegedClient } from "@/lib/supabase/privileged.server";
import { siteUrl } from "@/lib/auth/site-url.server";
import type { Database } from "@/types/database.generated";
import { sendTransactionalEmail } from "./send-email";
import { appointmentEmailKind } from "./lifecycle";
import { operationalRecipientScope, resolveCustomerEmail, resolveStaffEmail } from "./recipients";
import { renderAppointmentEmail, type AppointmentEmailDetails, type EmailBusiness } from "./templates";
import type { EmailDeliveryResult } from "./types";

type OutboxRow = Database["public"]["Tables"]["notification_outbox"]["Row"];
type AppointmentRow = Database["public"]["Tables"]["appointments"]["Row"];
type FailureCode = Exclude<EmailDeliveryResult, { ok: true }>["code"] | "no_recipient" | "unsupported_event";

class DeliveryFailure extends Error {
  constructor(readonly code: FailureCode, readonly retryable: boolean) { super(code); }
}

const guestLink = z.object({ appointment_id: z.uuid(), token: z.string().regex(/^[A-Za-z0-9_-]{40,60}$/) });
const safeEmail = z.email().max(254);

function keyFor(deduplicationKey: string, recipient: string, role: string) {
  return createHash("sha256").update(`${deduplicationKey}:${role}:${recipient.trim().toLowerCase()}`).digest("hex");
}

async function send(input: AppointmentEmailDetails) {
  const result = await sendTransactionalEmail(renderAppointmentEmail(input));
  if (!result.ok) throw new DeliveryFailure(result.code, result.retryable);
}

async function loadBusiness() {
  const client = createPrivilegedClient();
  const { data, error } = await client.from("business_settings")
    .select("name,timezone,contact_email,contact_phone,booking_approval_mode").maybeSingle();
  if (error || !data) throw new DeliveryFailure("provider_error", true);
  return {
    client,
    data,
    brand: { name: data.name, contactEmail: data.contact_email, contactPhone: data.contact_phone } satisfies EmailBusiness,
  };
}

async function appointmentEmailData(client: ReturnType<typeof createPrivilegedClient>, appointmentId: string) {
  const { data: appointment, error } = await client.from("appointments")
    .select("id,public_reference,state,starts_at,currency,total_amount,required_payment_amount,payment_due_at,customer_id,staff_id")
    .eq("id", appointmentId).maybeSingle();
  if (error || !appointment) throw new DeliveryFailure("unsupported_event", false);
  const [item, staff, customer] = await Promise.all([
    client.from("appointment_items").select("service_name_snapshot").eq("appointment_id", appointment.id).maybeSingle(),
    client.from("staff").select("display_name,auth_user_id,active").eq("id", appointment.staff_id).maybeSingle(),
    client.from("customers").select("display_name,email,auth_user_id").eq("id", appointment.customer_id).maybeSingle(),
  ]);
  if (item.error || staff.error || customer.error || !item.data || !staff.data || !customer.data) {
    throw new DeliveryFailure("provider_error", true);
  }
  return { appointment, serviceName: item.data.service_name_snapshot, staff: staff.data, customer: customer.data };
}

async function customerRecipient(client: ReturnType<typeof createPrivilegedClient>, customer: { email: string | null; auth_user_id: string | null }) {
  if (customer.auth_user_id) {
    const [profile, account] = await Promise.all([
      client.from("profiles").select("disabled_at").eq("auth_user_id", customer.auth_user_id).maybeSingle(),
      client.auth.admin.getUserById(customer.auth_user_id),
    ]);
    if (profile.error || account.error) throw new DeliveryFailure("provider_error", true);
    return resolveCustomerEmail({
      authUserId: customer.auth_user_id, storedEmail: customer.email,
      linkedAuthEmail: account.data.user?.email,
      linkedAuthEmailConfirmed: Boolean(account.data.user?.email_confirmed_at),
      linkedProfileActive: Boolean(profile.data && !profile.data.disabled_at),
    });
  }
  return resolveCustomerEmail({ authUserId: null, storedEmail: customer.email });
}

async function staffRecipient(client: ReturnType<typeof createPrivilegedClient>, authUserId: string | null, active: boolean) {
  if (!authUserId || !active) return null;
  const [profile, account] = await Promise.all([
    client.from("profiles").select("disabled_at").eq("auth_user_id", authUserId).maybeSingle(),
    client.auth.admin.getUserById(authUserId),
  ]);
  if (profile.error || account.error) throw new DeliveryFailure("provider_error", true);
  return resolveStaffEmail({
    authUserId, active, linkedAuthEmail: account.data.user?.email,
    linkedAuthEmailConfirmed: Boolean(account.data.user?.email_confirmed_at),
    linkedProfileActive: Boolean(profile.data && !profile.data.disabled_at),
  });
}

async function adminRecipients(client: ReturnType<typeof createPrivilegedClient>) {
  const { data: assignments, error } = await client.from("user_roles").select("auth_user_id,role").in("role", ["OWNER", "ADMIN"]);
  if (error) throw new DeliveryFailure("provider_error", true);
  const recipients = await Promise.all((assignments ?? []).map(async assignment => {
    const [profile, account] = await Promise.all([
      client.from("profiles").select("disabled_at").eq("auth_user_id", assignment.auth_user_id).maybeSingle(),
      client.auth.admin.getUserById(assignment.auth_user_id),
    ]);
    if (profile.error || account.error) throw new DeliveryFailure("provider_error", true);
    const email = account.data.user?.email;
    return profile.data && !profile.data.disabled_at && account.data.user?.email_confirmed_at && email && safeEmail.safeParse(email).success
      ? { email, role: assignment.role.toLowerCase() }
      : null;
  }));
  const unique = new Map<string, { email: string; role: string }>();
  for (const recipient of recipients) {
    if (recipient) unique.set(recipient.email.trim().toLowerCase(), { email: recipient.email, role: "admin_ops" });
  }
  return [...unique.values()];
}

async function appointmentCta(client: ReturnType<typeof createPrivilegedClient>, appointment: Pick<AppointmentRow, "id">, customerEmail: string, guest: boolean) {
  if (!guest) return `${siteUrl()}/account/appointments`;
  const { data, error } = await client.rpc("issue_guest_access_link", {
    p_email: customerEmail.trim().toLowerCase(), p_reference: null, p_appointment: appointment.id,
  });
  const parsed = guestLink.safeParse(data);
  if (error || !parsed.success || parsed.data.appointment_id !== appointment.id) throw new DeliveryFailure("provider_error", true);
  return `${siteUrl()}/booking/access#token=${encodeURIComponent(parsed.data.token)}`;
}

async function sendToRecipient(input: Omit<AppointmentEmailDetails, "idempotencyKey">, job: OutboxRow, role: string) {
  await send({ ...input, idempotencyKey: keyFor(job.deduplication_key, input.to, role) });
}

async function deliverStateChanged(job: OutboxRow) {
  if (!job.appointment_id) throw new DeliveryFailure("unsupported_event", false);
  const { client, data: business, brand } = await loadBusiness();
  const { data: event, error: eventError } = await client.from("appointment_events")
    .select("id,to_state,reason").eq("id", job.deduplication_key).eq("appointment_id", job.appointment_id).maybeSingle();
  if (eventError) throw new DeliveryFailure("provider_error", true);
  if (!event) throw new DeliveryFailure("unsupported_event", false);

  const state = event.to_state;
  let verifiedPayment = false;
  if (state === "CONFIRMED") {
    const { data: paid, error } = await client.from("payments").select("id")
      .eq("appointment_id", job.appointment_id).eq("state", "SUCCEEDED").is("exception_reason", null).limit(1);
    if (error) throw new DeliveryFailure("provider_error", true);
    verifiedPayment = Boolean(paid?.length);
  }
  const kind = appointmentEmailKind(state, verifiedPayment);
  if (!kind) return;
  const context = await appointmentEmailData(client, job.appointment_id);

  const recipient = await customerRecipient(client, context.customer);
  const sends: Promise<void>[] = [];
  if (recipient) {
    const ctaUrl = await appointmentCta(client, context.appointment, recipient.email, recipient.guest);
    let amountMinor: number | undefined;
    if (kind === "booking.payment_required" || kind === "booking.payment_expired") {
      amountMinor = context.appointment.required_payment_amount;
    } else if (kind === "booking.payment_confirmed") {
      const { data: payment, error } = await client.from("payments").select("amount")
        .eq("appointment_id", job.appointment_id).eq("state", "SUCCEEDED").is("exception_reason", null)
        .order("paid_at", { ascending: false }).limit(1).maybeSingle();
      if (error || !payment) throw new DeliveryFailure(error ? "provider_error" : "unsupported_event", Boolean(error));
      amountMinor = payment.amount;
    }
    const email = {
      to: recipient.email, kind, reference: context.appointment.public_reference,
      serviceName: context.serviceName, staffName: context.staff.display_name,
      startsAt: context.appointment.starts_at, timezone: business.timezone, business: brand, ctaUrl,
      declineReason: kind === "booking.declined" && event.reason
        ? event.reason.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 500) || undefined
        : undefined,
      amountMinor, currency: amountMinor === undefined ? undefined : context.appointment.currency,
      paymentDueAt: kind === "booking.payment_required" ? context.appointment.payment_due_at : null,
    } satisfies Omit<AppointmentEmailDetails, "idempotencyKey">;
    sends.push(sendToRecipient(email, job, recipient.guest ? "guest" : "customer"));
  }

  const operationsScope = operationalRecipientScope(state, business.booking_approval_mode);
  if (operationsScope === "assigned_staff") {
    const email = await staffRecipient(client, context.staff.auth_user_id, context.staff.active);
    if (email) {
      const ctaUrl = `${siteUrl()}/staff/appointments`;
      sends.push(sendToRecipient({
        to: email, kind: "business.new_booking", reference: context.appointment.public_reference,
        serviceName: context.serviceName, staffName: context.staff.display_name,
        startsAt: context.appointment.starts_at, timezone: business.timezone, business: brand, ctaUrl,
      }, job, "assigned_staff"));
    }
  } else if (operationsScope === "admin_ops") {
    const recipients = await adminRecipients(client);
    const ctaUrl = `${siteUrl()}/admin/appointments`;
    for (const recipient of recipients) {
      sends.push(sendToRecipient({
        to: recipient.email, kind: "business.new_booking", reference: context.appointment.public_reference,
        serviceName: context.serviceName, staffName: context.staff.display_name,
        startsAt: context.appointment.starts_at, timezone: business.timezone, business: brand, ctaUrl,
      }, job, recipient.role));
    }
  }

  if (!sends.length) throw new DeliveryFailure("no_recipient", false);
  const results = await Promise.allSettled(sends);
  const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failure) throw failure.reason instanceof DeliveryFailure ? failure.reason : new DeliveryFailure("network_error", true);
}

async function deliverPaymentException(job: OutboxRow) {
  if (!job.appointment_id) throw new DeliveryFailure("unsupported_event", false);
  const paymentId = job.deduplication_key.replace(/^payment-exception:/, "");
  if (paymentId === job.deduplication_key) throw new DeliveryFailure("unsupported_event", false);
  const { client, data: business, brand } = await loadBusiness();
  const recipient = business.contact_email?.trim();
  if (!recipient || !safeEmail.safeParse(recipient).success) throw new DeliveryFailure("no_recipient", false);
  const context = await appointmentEmailData(client, job.appointment_id);
  const { data: payment, error } = await client.from("payments").select("id,amount,currency,state,exception_reason")
    .eq("id", paymentId).eq("appointment_id", job.appointment_id).eq("state", "SUCCEEDED").maybeSingle();
  if (error || !payment) throw new DeliveryFailure(error ? "provider_error" : "unsupported_event", Boolean(error));
  if (payment.exception_reason !== "LATE_PAYMENT_REVIEW") throw new DeliveryFailure("unsupported_event", false);
  await sendToRecipient({
    to: recipient, kind: "business.payment_exception", reference: context.appointment.public_reference,
    serviceName: context.serviceName, staffName: context.staff.display_name,
    startsAt: context.appointment.starts_at, timezone: business.timezone, business: brand,
    amountMinor: payment.amount, currency: payment.currency,
  }, job, "business_contact");
}

async function processJob(client: ReturnType<typeof createPrivilegedClient>, job: OutboxRow) {
  try {
    if (job.kind === "APPOINTMENT_STATE_CHANGED") await deliverStateChanged(job);
    else if (job.kind === "PAYMENT_EXCEPTION") await deliverPaymentException(job);
    else throw new DeliveryFailure("unsupported_event", false);
    const { error } = await client.rpc("finish_notification_outbox", { p_id: job.id, p_success: true, p_retryable: false, p_error_code: null });
    if (error) throw new Error("Outbox acknowledgment failed.");
    return "delivered" as const;
  } catch (error) {
    const failure = error instanceof DeliveryFailure ? error : new DeliveryFailure("network_error", true);
    try {
      await client.rpc("finish_notification_outbox", {
        p_id: job.id, p_success: false, p_retryable: failure.retryable,
        p_error_code: failure.code,
      });
    } catch { /* A later lease will recover an unacknowledged job. */ }
    return failure.retryable ? "retrying" as const : "failed" as const;
  }
}

/** Claims the existing DB outbox and performs provider delivery after commit. */
export async function dispatchNotificationOutbox(batchSize = 20) {
  const client = createPrivilegedClient();
  const { data, error } = await client.rpc("claim_notification_outbox", { p_limit: Math.min(Math.max(batchSize, 1), 50) });
  if (error || !data) throw new Error("Notification delivery is temporarily unavailable.");
  const jobs = data as unknown as OutboxRow[];
  let delivered = 0, retrying = 0, failed = 0;
  // Keep provider pressure bounded while avoiding serial max-duration calls.
  for (let index = 0; index < jobs.length; index += 5) {
    const group = jobs.slice(index, index + 5);
    const results = await Promise.all(group.map(job => processJob(client, job)));
    delivered += results.filter(value => value === "delivered").length;
    retrying += results.filter(value => value === "retrying").length;
    failed += results.filter(value => value === "failed").length;
  }
  return { claimed: jobs.length, delivered, retrying, failed };
}
