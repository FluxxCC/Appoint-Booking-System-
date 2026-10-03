"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Status = "checking" | "paid" | "review" | "pending" | "expired" | "unavailable";

export function PaymentReturnStatus({ appointmentId, bookingHref, initialStatus, cancelled, reference, service, staff, reservedAt, amount }: {
  appointmentId: string;
  bookingHref: string;
  initialStatus: Status;
  cancelled: boolean;
  reference: string;
  service: string;
  staff: string;
  reservedAt: string;
  amount: string;
}) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [retry, setRetry] = useState(0);

  const verify = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch("/api/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId }),
        cache: "no-store",
        signal,
      });
      const body = await response.json() as { status?: Status };
      if (!response.ok || !body.status || !["paid", "review", "pending", "expired", "unavailable"].includes(body.status)) {
        if (!signal.aborted) setStatus("unavailable");
        return "unavailable" as Status;
      }
      if (!signal.aborted) setStatus(body.status);
      return body.status;
    } catch {
      if (!signal.aborted) setStatus("unavailable");
      return "unavailable" as Status;
    }
  }, [appointmentId]);

  useEffect(() => {
    if (initialStatus === "paid" || initialStatus === "review") return;
    const controller = new AbortController();
    let cancelledEffect = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const run = async () => {
      attempts += 1;
      const result = await verify(controller.signal);
      if (!cancelledEffect && attempts < 5 && (result === "pending" || result === "unavailable")) {
        timer = setTimeout(run, 5_000);
      }
    };
    void run();
    return () => {
      cancelledEffect = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [initialStatus, retry, verify]);

  return <section aria-live="polite" className="mt-6 rounded-2xl border border-line bg-surface p-5 sm:p-6">
    {status === "paid" ? <>
      <p className="eyebrow">Payment verified</p>
      <h2 className="mt-2 display-type text-3xl">Payment successful</h2>
      <p className="mt-3 leading-7">Your booking is reserved for <strong>{reservedAt}</strong>.</p>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted">Service</dt><dd className="mt-1 font-semibold">{service}</dd></div><div><dt className="text-muted">Professional</dt><dd className="mt-1 font-semibold">{staff}</dd></div><div><dt className="text-muted">Booking reference</dt><dd className="mt-1 font-semibold">{reference}</dd></div><div><dt className="text-muted">Payment received</dt><dd className="mt-1 font-semibold">{amount}</dd></div></dl>
    </> : status === "review" ? <>
      <p className="eyebrow">Payment verified</p>
      <h2 className="mt-2 display-type text-3xl">Payment received — booking needs review</h2>
      <p className="mt-3 leading-7">PayMongo verified the payment, but the appointment is not currently reserved. Contact the business with reference <strong>{reference}</strong> so the team can review it.</p>
    </> : status === "expired" ? <>
      <p className="eyebrow">Checkout expired</p>
      <h2 className="mt-2 display-type text-3xl">Payment session expired</h2>
      <p className="mt-3 leading-7">PayMongo reports that this checkout session expired without a verified payment. If your appointment payment window is still open, return to your booking to start a new checkout. If you completed payment, check again so we can reconcile PayMongo’s latest status.</p>
      <button type="button" onClick={() => { setStatus("checking"); setRetry(value => value + 1); }} className="button-secondary mt-5">Check payment again</button>
    </> : <>
      <p className="eyebrow">Secure payment</p>
      <h2 className="mt-2 display-type text-3xl">{status === "checking" ? "Checking payment status" : status === "unavailable" ? "We could not check yet" : cancelled ? "No payment confirmed yet" : "Payment is still being verified"}</h2>
      <p className="mt-3 leading-7 text-muted">{status === "unavailable"
        ? "The payment provider could not be reached. Your appointment has not been marked paid. Try checking again, or contact the business if you completed payment."
        : cancelled
          ? "Returning from checkout does not confirm or cancel a payment. If you completed payment, check again while PayMongo confirms it."
          : "We are checking PayMongo's verified payment status. Your appointment will show as reserved only after payment confirmation."}</p>
      <button type="button" onClick={() => { setStatus("checking"); setRetry(value => value + 1); }} className="button-secondary mt-5">Check payment again</button>
    </>}
    <div className="mt-6 flex flex-wrap gap-4"><Link href={bookingHref} className="button-primary">{status === "expired" ? "Return to booking and try again" : "View booking"}</Link><Link href="/refund-policy" className="self-center text-sm font-semibold text-accent-dark underline">Refund policy</Link></div>
  </section>;
}
