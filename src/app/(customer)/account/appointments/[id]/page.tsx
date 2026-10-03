import Link from "next/link";
import { requireArea } from "@/lib/auth/access.server";
import { readCustomerAppointment } from "@/features/appointments/customer-data.server";
import { appointmentStatus } from "@/features/appointments/customer-status";
import { bookingGuidance } from "@/features/appointments/customer-guidance";
import { PaymentPreparation } from "@/features/appointments/payment-preparation";
import { formatBusinessTime } from "@/lib/time";
import { money } from "@/features/public-site/model";
import { StatusBadge } from "@/components/ui/status-badge";

export default async function CustomerAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await readCustomerAppointment(id);
  const { supabase } = await requireArea("account");
  const { data } = await supabase.from("business_settings").select("timezone,contact_email").maybeSingle();
  const zone = data?.timezone ?? "UTC";
  return <main className="mx-auto max-w-4xl px-5 py-8"><Link href="/account/appointments" className="text-sm font-semibold text-accent-dark">← Appointments</Link>
    <div className="mt-7 flex flex-wrap items-start justify-between gap-5"><div><p className="eyebrow">Appointment · {a.public_reference}</p><h1 className="display-type mt-3 text-4xl sm:text-5xl">{a.service_name}</h1><p className="mt-3 text-muted">{formatBusinessTime(a.starts_at, zone)} · {a.duration_minutes} minutes</p></div><StatusBadge value={a.state}>{appointmentStatus(a.state)}</StatusBadge></div>
    <div className="surface-card mt-8 p-6 sm:p-8"><h2 className="text-lg font-semibold">Your visit details</h2>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2"><div><dt className="text-xs uppercase text-muted">Professional</dt><dd className="mt-1">{a.staff_name}</dd></div><div><dt className="text-xs uppercase text-muted">Service price</dt><dd className="mt-1">{money(a.total_amount,a.currency)}</dd></div><div><dt className="text-xs uppercase text-muted">Payment</dt><dd className="mt-1">{a.payment_mode_snapshot === "PAY_AT_BUSINESS" ? "Pay at the business" : a.state === "AWAITING_PAYMENT" ? `${money(a.required_payment_amount,a.currency)} required` : a.payment_status ? `Payment ${a.payment_status.toLowerCase()}` : "No payment taken"}</dd></div>
        {a.payment_due_at && <div><dt className="text-xs uppercase text-muted">Payment deadline</dt><dd className="mt-1">{formatBusinessTime(a.payment_due_at, zone)}</dd></div>}
      </dl>
    </div>
    {a.state === "AWAITING_PAYMENT" && <PaymentPreparation appointmentId={id} amount={a.required_payment_amount} currency={a.currency} deadline={a.payment_due_at} timezone={zone} contactEmail={data?.contact_email} />}
    {a.state !== "AWAITING_PAYMENT" && <section className="mt-5 rounded-2xl border border-line bg-accent-soft p-5"><h2 className="text-sm font-semibold">What happens next</h2><p className="mt-2 text-sm leading-6">{bookingGuidance(a.state)}</p></section>}
    <Link href="/services" className="button-secondary mt-7">Explore more services</Link>
  </main>;
}
