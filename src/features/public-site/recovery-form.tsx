"use client";
import { useActionState } from "react";
import { requestGuestRecoveryAction } from "./recovery-actions";

export function RecoveryForm() {
  const [state, action, pending] = useActionState(requestGuestRecoveryAction, {});
  return <form action={action} className="mt-6 grid gap-4">
    <label className="text-sm font-medium">Booking email<input name="email" type="email" required autoComplete="email" maxLength={254} className="mt-2 min-h-12 w-full rounded-control border border-line bg-surface px-4" /></label>
    <label className="text-sm font-medium">Booking reference<input name="reference" required placeholder="BK-..." maxLength={19} autoCapitalize="characters" className="mt-2 min-h-12 w-full rounded-control border border-line bg-surface px-4 uppercase" /></label>
    {state.error && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{state.error}</p>}
    {state.success && <p role="status" className="rounded-xl bg-accent-soft p-3 text-sm text-accent-dark">{state.success}</p>}
    <button disabled={pending} className="button-primary w-fit disabled:opacity-60">{pending ? "Requesting link…" : "Email me a private link"}</button>
  </form>;
}
