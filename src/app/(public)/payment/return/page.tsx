import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Payment status", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PaymentReturnPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const { result } = await searchParams;
  const returnedFromCancel = result === "cancelled";
  return <main className="mx-auto max-w-2xl px-5 py-16"><div className="surface-card p-7 sm:p-10">
    <p className="eyebrow">Secure payment</p>
    <h1 className="mt-3 display-type text-4xl">Checking payment status</h1>
    <p className="mt-4 leading-7 text-muted">{returnedFromCancel
      ? "You returned from checkout. Your appointment status has not been changed."
      : "Your browser return is not proof of payment. PayMongo will notify us securely, and we will update your appointment after verification."}</p>
    <div className="mt-7 flex flex-wrap gap-4"><Link href="/account/appointments" className="button-primary">View customer appointments</Link><Link href="/booking/manage" className="button-secondary">Open a private guest booking</Link></div>
  </div></main>;
}
