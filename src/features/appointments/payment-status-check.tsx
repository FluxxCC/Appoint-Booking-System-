"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Status = "paid" | "review" | "pending" | "expired" | "unavailable";

export function PaymentStatusCheck({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status | "checking">("checking");
  const [pending, setPending] = useState(true);
  const checkedAppointment = useRef<string | null>(null);

  const check = useCallback(async () => {
    setPending(true);
    try {
      const response = await fetch("/api/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId }),
        cache: "no-store",
      });
      const body = await response.json() as { status?: Status };
      const next = response.ok && body.status && ["paid", "review", "pending", "expired", "unavailable"].includes(body.status)
        ? body.status : "unavailable";
      setStatus(next);
      if (next === "paid") router.refresh();
    } catch {
      setStatus("unavailable");
    } finally {
      setPending(false);
    }
  }, [appointmentId, router]);

  useEffect(() => {
    if (checkedAppointment.current === appointmentId) return;
    checkedAppointment.current = appointmentId;
    void check();
  }, [appointmentId, check]);

  const message = status === "paid"
    ? "PayMongo verified your payment. Your booking is reserved."
    : status === "review"
      ? "PayMongo verified a payment, but this booking needs business review. Contact the business before assuming the appointment is reserved."
      : status === "pending"
        ? "No completed payment is verified yet. If you just paid, wait a moment and check again."
        : status === "expired"
          ? "The previous PayMongo checkout expired. If your payment window is still open, start a new checkout above."
        : status === "unavailable"
          ? "Payment status could not be checked right now. Your booking has not been marked paid. Try again or contact the business."
          : status === "checking"
            ? "Checking PayMongo's verified payment status…"
            : "Already completed payment? Check PayMongo's verified status here.";

  return <div className="mt-4 rounded-xl border border-line p-4">
    <p aria-live="polite" className="text-sm leading-6 text-muted">{message}</p>
    <button type="button" onClick={() => void check()} disabled={pending} className="button-secondary mt-3 disabled:opacity-60">{pending ? "Checking…" : "Check payment status"}</button>
  </div>;
}
