import "server-only";
import Link from "next/link";
import { money } from "@/features/public-site/model";
import { formatBusinessTime } from "@/lib/time";
import { isPayMongoTestConfigured } from "@/lib/payments/paymongo.server";
import { supportsPayMongoCurrency } from "@/lib/payments/paymongo-core";
import { PaymentOnlineButton } from "./payment-online-button";

export function PaymentPreparation({ appointmentId, amount, currency, deadline, timezone, contactEmail }: {
  appointmentId: string; amount: number; currency: string; deadline: string | null; timezone: string; contactEmail?: string | null;
}) {
  const available = isPayMongoTestConfigured()
    && supportsPayMongoCurrency(currency)
    && /^[0-9a-f-]{36}$/i.test(appointmentId)
    && Number.isSafeInteger(amount) && amount > 0
    && Boolean(deadline && Number.isFinite(Date.parse(deadline)));
  return <section aria-labelledby="payment-next-step" className="mt-6 rounded-2xl border border-warning/30 bg-warning-soft p-5">
    <h2 id="payment-next-step" className="display-type text-2xl">Payment required</h2>
    <p className="mt-2 text-sm leading-6">{money(amount, currency)} is required to confirm this appointment.</p>
    {deadline && <p className="mt-2 text-sm">Pay by {formatBusinessTime(deadline, timezone)} to keep this time reserved.</p>}
    {available && deadline ? <PaymentOnlineButton appointmentId={appointmentId} deadline={deadline} enabled={available} /> : <div className="mt-4 flex flex-wrap items-center gap-3">
      <button type="button" disabled aria-describedby="payment-unavailable" className="rounded-full bg-line px-5 py-3 font-semibold text-ink">Pay online</button>
      <p id="payment-unavailable" className="text-sm text-ink">Online payment is currently unavailable. {contactEmail ? <>Contact <Link href={`mailto:${contactEmail}`} className="font-semibold underline">the business</Link> for payment instructions.</> : "Contact the business for payment instructions."}</p>
    </div>}
  </section>;
}
