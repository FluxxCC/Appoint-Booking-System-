"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { acceptAsAdmin, declineAsAdmin } from "@/features/appointments/actions";
import { Form } from "./forms";

export function ReviewActions({ appointmentId }: { appointmentId: string }) {
  const [showDecline, setShowDecline] = useState(false);
  const declinePanelId = useId();

  return <div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link href={`/admin/appointments/${appointmentId}`} className="text-sm font-semibold text-accent-dark hover:underline">View booking details →</Link>
      <div className="flex flex-wrap items-center gap-2">
        <Form action={acceptAsAdmin} hidden={{ appointmentId }} fields={[]} submit="Accept request" />
        <button type="button" aria-expanded={showDecline} aria-controls={declinePanelId} onClick={() => setShowDecline(value => !value)} className="button-secondary border-danger/25 text-danger hover:border-danger/50 hover:bg-danger-soft">{showDecline ? "Cancel decline" : "Decline"}</button>
      </div>
    </div>
    {showDecline && <div id={declinePanelId} className="mt-5 rounded-2xl border border-danger/20 bg-danger-soft/50 p-4 sm:p-5">
      <h4 className="text-sm font-semibold text-ink">Decline this request</h4>
      <p className="mb-4 mt-1 text-sm leading-6 text-muted">Provide a clear reason before confirming. This cannot be submitted without a reason.</p>
      <Form action={declineAsAdmin} hidden={{ appointmentId }} fields={[{ name: "reason", label: "Reason for declining", type: "textarea", required: true, minLength: 10, maxLength: 1000, hint: "At least 10 characters." }]} submit="Confirm decline" submitClassName="inline-flex min-h-12 items-center justify-center rounded-xl border border-danger bg-danger px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50" />
    </div>}
  </div>;
}
