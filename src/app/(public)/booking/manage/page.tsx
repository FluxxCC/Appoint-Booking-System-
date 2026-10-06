import type { Metadata } from "next";
import Link from "next/link";
import { BackButton } from "@/components/ui/back-button";
import { readGuestBooking } from "@/features/public-site/booking-data.server";
import { readPublicWebsite } from "@/features/public-site/data.server";
import { RecoveryForm } from "@/features/public-site/recovery-form";
import { appointmentStatus } from "@/features/appointments/customer-status";
import { bookingGuidance } from "@/features/appointments/customer-guidance";
import { PaymentPreparation } from "@/features/appointments/payment-preparation";
import { formatBusinessTime } from "@/lib/time";
import { money } from "@/features/public-site/model";
import type { Database } from "@/types/database.generated";

export const metadata: Metadata = { title: "Manage private booking", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ManageGuestBooking({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const [{ id }, site] = await Promise.all([searchParams, readPublicWebsite()]);
  const appointment = id ? await readGuestBooking(id) : null;
  if (!appointment) return <main className="mx-auto max-w-2xl px-5 py-16"><div className="surface-card p-7 sm:p-10">
    <p className="eyebrow">Private access</p><h1 className="mt-3 display-type text-4xl">Manage a guest booking</h1>
    <p className="mt-4 leading-7 text-muted">Your booking is private. Enter the email and booking reference from your confirmation to request a one-time access link. A reference alone cannot open a booking.</p>
    <RecoveryForm />
    <p className="mt-6 text-sm text-muted">Still using the browser where you booked? Open your original confirmation link. You can also <Link href="/book" className="font-semibold text-accent-dark underline">make a new booking</Link>.</p>
  </div></main>;
  const state = appointment.state as Database["public"]["Enums"]["appointment_state"];
  const currency = String(appointment.currency);
  const zone = String(appointment.timezone ?? site.business?.timezone ?? "UTC");
  const required = Number(appointment.required_payment_amount ?? 0);
  return <main className="mx-auto max-w-2xl px-5 py-16"><div className="surface-card p-7 sm:p-10">
    <p className="eyebrow">{site.business?.name ?? "Guest booking"}</p>
    <h1 className="mt-3 display-type text-4xl">Your appointment</h1>
    <p className="mt-3 text-muted">Reference <span className="font-semibold text-ink">{String(appointment.reference)}</span></p>
    <div className="mt-7 rounded-2xl bg-canvas p-5">
      <p className="text-lg font-semibold">{appointmentStatus(state)}</p>
      <p className="mt-4 font-medium">{String(appointment.service_name)}</p>
      <p className="text-sm text-muted">With {String(appointment.staff_name)} · {formatBusinessTime(String(appointment.starts_at), zone)}</p>
      <p className="mt-3 text-sm text-muted">{money(Number(appointment.total_amount), currency)} · {state === "PAYMENT_EXPIRED" ? "Payment window expired; time released" : state === "CONFIRMED" && appointment.payment_mode !== "PAY_AT_BUSINESS" ? `${money(required, currency)} payment received` : appointment.payment_mode === "PAY_AT_BUSINESS" ? "Pay at the business" : state === "AWAITING_PAYMENT" ? `${money(required, currency)} required` : "Payment required only after acceptance"}</p>
    </div>
    <p className="mt-5 text-sm leading-6 text-muted">{bookingGuidance(state)}</p>
    {state === "AWAITING_PAYMENT" && <PaymentPreparation appointmentId={String(appointment.id)} amount={required} currency={currency} deadline={appointment.payment_due_at ? String(appointment.payment_due_at) : null} timezone={zone} contactEmail={site.business?.contact_email} />}
    {state === "PENDING" && <p className="mt-5 rounded-xl bg-accent-soft p-4 text-sm leading-6">Keep this private browser access. If you change devices or lose this page, request a fresh email link using your booking reference.</p>}
    <div className="mt-7 flex flex-wrap gap-4">{state === "PAYMENT_EXPIRED" && <Link href="/book" className="text-sm font-semibold text-accent-dark underline">Make a new booking</Link>}<Link href="/booking/manage" className="text-sm font-semibold text-accent-dark underline">Request another private link</Link><BackButton href="/">Back to website</BackButton></div>
  </div></main>;
}
