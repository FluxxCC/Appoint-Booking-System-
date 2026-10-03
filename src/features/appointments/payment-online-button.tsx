"use client";

import { useEffect, useState, type FormEvent } from "react";

export function PaymentOnlineButton({ appointmentId, deadline, enabled }: {
  appointmentId: string;
  deadline: string;
  enabled: boolean;
}) {
  const [deadlineValid, setDeadlineValid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const update = () => setDeadlineValid(Number.isFinite(Date.parse(deadline)) && Date.parse(deadline) > Date.now());
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [deadline]);
  const canSubmit = enabled && deadlineValid;
  async function startCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/payments/checkout", {
        method: "POST",
        body: new FormData(event.currentTarget),
        headers: { Accept: "application/json" },
        credentials: "same-origin",
        cache: "no-store",
      });
      if (response.redirected) {
        window.location.assign(response.url);
        return;
      }
      const result: unknown = await response.json();
      if (!response.ok || typeof result !== "object" || result === null || !("checkoutUrl" in result) || typeof result.checkoutUrl !== "string") {
        throw new Error("Checkout could not be started.");
      }
      const checkout = new URL(result.checkoutUrl);
      if (checkout.protocol !== "https:" || checkout.hostname !== "checkout.paymongo.com") {
        throw new Error("Checkout could not be started.");
      }
      window.location.assign(checkout.toString());
    } catch {
      setError("Secure checkout could not be started. Please try again or contact the business.");
      setSubmitting(false);
    }
  }
  return <form action="/api/payments/checkout" method="post" onSubmit={startCheckout} className="mt-4 flex flex-wrap items-center gap-3">
    <input type="hidden" name="appointmentId" value={appointmentId} />
    <button type="submit" disabled={!canSubmit || submitting} className="rounded-full bg-accent px-5 py-3 font-semibold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50">{submitting ? "Opening secure checkout…" : "Pay online"}</button>
    <p className="text-sm text-ink">Secure checkout is hosted by PayMongo. Payment is confirmed only after server verification.</p>
    {error && <p role="alert" className="w-full text-sm text-danger">{error}</p>}
  </form>;
}
