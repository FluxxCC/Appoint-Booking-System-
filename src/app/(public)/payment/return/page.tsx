import type { Metadata } from "next";
import Link from "next/link";
import { PaymentReturnStatus } from "@/features/appointments/payment-return-status";
import { readPaymentReturnBooking } from "@/lib/payments/payment-return.server";
import { formatBusinessTime } from "@/lib/time";
import { money } from "@/features/public-site/model";

export const metadata: Metadata = { title: "Payment status", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PaymentReturnPage({ searchParams }: { searchParams: Promise<{ result?: string; appointmentId?: string }> }) {
  const { result, appointmentId } = await searchParams;
  const booking = appointmentId ? await readPaymentReturnBooking(appointmentId) : null;
  if (!booking) return <main className="mx-auto max-w-2xl px-5 py-16"><div className="surface-card p-7 sm:p-10">
    <p className="eyebrow">Secure payment</p>
    <h1 className="mt-3 display-type text-4xl">Payment status</h1>
    <p className="mt-4 leading-7 text-muted">We could not open a booking for this browser session. Use the secure appointment link from your email, sign in to your customer account, or request a new private guest link.</p>
    <div className="mt-7 flex flex-wrap gap-4"><Link href="/booking/manage" className="button-primary">Open private booking</Link><Link href="/account/appointments" className="button-secondary">Customer appointments</Link><Link href="/refund-policy" className="self-center text-sm font-semibold text-accent-dark underline">Refund policy</Link></div>
  </div></main>;

  const initialStatus = booking.paymentStatus === "SUCCEEDED"
    ? booking.paymentException || booking.state !== "CONFIRMED" ? "review" : "paid"
    : "checking";
  const bookingHref = booking.accessKind === "guest"
    ? `/booking/manage?id=${encodeURIComponent(booking.id)}`
    : `/account/appointments/${encodeURIComponent(booking.id)}`;
  return <main className="mx-auto max-w-2xl px-5 py-16"><div className="surface-card p-7 sm:p-10">
    <p className="eyebrow">{booking.accessKind === "guest" ? "Private guest booking" : "Customer booking"}</p>
    <h1 className="mt-3 display-type text-4xl">Your appointment</h1>
    <p className="mt-3 text-muted">Reference <span className="font-semibold text-ink">{booking.publicReference}</span></p>
    <div className="mt-5 rounded-2xl bg-canvas p-5">
      <p className="font-semibold">{booking.serviceName}</p>
      <p className="mt-1 text-sm text-muted">With {booking.staffName} · {formatBusinessTime(booking.startsAt, booking.timezone)}</p>
      <p className="mt-2 text-sm text-muted">Appointment total {money(booking.totalAmount, booking.currency)}</p>
    </div>
    <PaymentReturnStatus
      appointmentId={booking.id}
      bookingHref={bookingHref}
      initialStatus={initialStatus}
      cancelled={result === "cancelled"}
      reference={booking.publicReference}
      service={booking.serviceName}
      staff={booking.staffName}
      reservedAt={formatBusinessTime(booking.startsAt, booking.timezone)}
      amount={money(booking.requiredPaymentAmount, booking.currency)}
    />
  </div></main>;
}
