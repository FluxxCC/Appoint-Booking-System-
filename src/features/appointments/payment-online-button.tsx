"use client";

import { useEffect, useState } from "react";

export function PaymentOnlineButton({ appointmentId, deadline, enabled }: {
  appointmentId: string;
  deadline: string;
  enabled: boolean;
}) {
  const [deadlineValid, setDeadlineValid] = useState(false);
  useEffect(() => {
    const update = () => setDeadlineValid(Number.isFinite(Date.parse(deadline)) && Date.parse(deadline) > Date.now());
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [deadline]);
  const canSubmit = enabled && deadlineValid;
  return <form action="/api/payments/checkout" method="post" className="mt-4 flex flex-wrap items-center gap-3">
    <input type="hidden" name="appointmentId" value={appointmentId} />
    <button type="submit" disabled={!canSubmit} className="rounded-full bg-accent px-5 py-3 font-semibold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50">Pay online</button>
    <p className="text-sm text-ink">Secure checkout is hosted by PayMongo. Payment is confirmed only after server verification.</p>
  </form>;
}
