"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Status = "paid" | "review" | "pending" | "unavailable";

export function PaymentStatusCheck({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [pending, setPending] = useState(false);

  async function check() {
    setPending(true);
    try {
      const response = await fetch("/api/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId }),
        cache: "no-store",
      });
      const body = await response.json() as { status?: Status };
      const next = response.ok && body.status && ["paid", "review", "pending", "unavailable"].includes(body.status)
        ? body.status : "unavailable";
      setStatus(next);
      if (next === "paid" || next === "review") router.refresh();
    } catch {
      setStatus("unavailable");
    } finally {
      setPending(false);
    }
  }

  const message = status === "paid"
    ? "PayMongo verified your payment. Your booking is reserved."
    : status === "review"
      ? "PayMongo verified a payment, but this booking needs business review. Contact the business before assuming the appointment is reserved."
      : status === "pending"
        ? "No completed payment is verified yet. If you just paid, wait a moment and check again."
        : status === "unavailable"
          ? "Payment status could not be checked right now. Your booking has not been marked paid. Try again or contact the business."
          : "Already completed payment? Check PayMongo's verified status here.";

  return <div className="mt-4 rounded-xl border border-line p-4">
    <p aria-live="polite" className="text-sm leading-6 text-muted">{message}</p>
    <button type="button" onClick={check} disabled={pending} className="button-secondary mt-3 disabled:opacity-60">{pending ? "Checking…" : "Check payment status"}</button>
  </div>;
}
