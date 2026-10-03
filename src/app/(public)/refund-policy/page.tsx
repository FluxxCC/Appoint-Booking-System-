import type { Metadata } from "next";
import Link from "next/link";
import { readPublicWebsite } from "@/features/public-site/data.server";

export const metadata: Metadata = { title: "Refund policy" };
export const dynamic = "force-dynamic";

export default async function RefundPolicyPage() {
  const site = await readPublicWebsite();
  const policy = site.refund_policy?.trim();
  return <main className="mx-auto max-w-3xl px-5 py-14 sm:py-20"><article className="surface-card p-7 sm:p-10">
    <p className="eyebrow">{site.business?.name ?? "Appointment bookings"}</p>
    <h1 className="mt-3 display-type text-4xl">Refund policy</h1>
    <p className="mt-4 leading-7 text-muted">Please read this information before requesting or expecting a refund.</p>
    {policy ? <div className="mt-7 whitespace-pre-line rounded-2xl bg-canvas p-5 text-sm leading-7">{policy}</div> : <p className="mt-7 rounded-2xl bg-warning-soft p-5 text-sm leading-7">The business has not published refund terms yet. Contact the business to ask about eligibility for your payment before cancelling or assuming a refund will be issued.</p>}
    <div className="mt-7 rounded-2xl border border-line p-5">
      <h2 className="font-semibold">Need help with a payment?</h2>
      <p className="mt-2 text-sm leading-6 text-muted">A payment is confirmed only after secure PayMongo verification. Cancelling an appointment does not automatically create or confirm a refund. Contact the business with your booking reference; the business will review the request and confirm its decision.</p>
      {site.business?.contact_email && <p className="mt-3 text-sm">Email <a className="font-semibold text-accent-dark underline" href={`mailto:${site.business.contact_email}`}>{site.business.contact_email}</a></p>}
      {site.business?.contact_phone && <p className="mt-2 text-sm">Call <a className="font-semibold text-accent-dark underline" href={`tel:${site.business.contact_phone}`}>{site.business.contact_phone}</a></p>}
      {!site.business?.contact_email && !site.business?.contact_phone && <Link href="/contact" className="mt-3 inline-block text-sm font-semibold text-accent-dark underline">Contact the business</Link>}
    </div>
    <div className="mt-7 flex flex-wrap gap-4"><Link href="/booking/manage" className="button-secondary">Manage booking</Link><Link href="/" className="self-center text-sm font-semibold text-accent-dark underline">Back to website</Link></div>
  </article></main>;
}
