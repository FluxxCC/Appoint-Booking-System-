"use client";

import { useActionState } from "react";
import type { FormState } from "@/features/auth/schemas";
import { connectStaffLoginAction, disableStaffLoginAction, inviteStaffLoginAction } from "./staff-login-actions";
import type { readOwnerStaffLoginAccess } from "./staff-login-access.server";
import { Empty, Table } from "@/features/admin/ui";

type StaffAccessRows = Awaited<ReturnType<typeof readOwnerStaffLoginAccess>>;

function Feedback({ state }: { state: FormState }) {
  return <>{state.error && <p role="alert" className="mt-2 text-sm text-danger">{state.error}</p>}{state.success && <p role="status" className="mt-2 text-sm text-success">{state.success}</p>}</>;
}

function EnableAccess({ staffId }: { staffId: string }) {
  const [inviteState, inviteAction, invitePending] = useActionState(inviteStaffLoginAction, {});
  const [connectState, connectAction, connectPending] = useActionState(connectStaffLoginAction, {});
  return <div className="space-y-4"><p className="text-sm font-medium">Login access · Not enabled</p>
    <form action={inviteAction} className="flex flex-wrap items-end gap-3"><input type="hidden" name="staffId" value={staffId}/><label className="min-w-44 flex-1 text-xs font-medium text-muted">Work email<input name="email" type="email" required maxLength={254} autoComplete="email" className="field-control mt-1.5 text-sm"/></label><button disabled={invitePending} className="button-primary disabled:opacity-50">{invitePending ? "Sending…" : "Invite and enable"}</button><Feedback state={inviteState}/></form>
    <details className="text-sm"><summary className="cursor-pointer font-semibold text-accent-dark underline underline-offset-4">Connect an existing account</summary><form action={connectAction} className="mt-4 flex flex-wrap items-end gap-3"><input type="hidden" name="staffId" value={staffId}/><label className="min-w-44 flex-1 text-xs font-medium text-muted">Account email<input name="email" type="email" required maxLength={254} autoComplete="email" className="field-control mt-1.5 text-sm"/></label><button disabled={connectPending} className="button-secondary disabled:opacity-50">{connectPending ? "Connecting…" : "Connect account"}</button><Feedback state={connectState}/></form></details>
  </div>;
}

function DisableAccess({ staffId, email }: { staffId: string; email: string }) {
  const [state, action, pending] = useActionState(disableStaffLoginAction, {});
  return <div><p className="text-sm font-medium">Login access · Enabled</p><p className="mt-1 break-all text-sm text-muted">{email}</p><form action={action} className="mt-3"><input type="hidden" name="staffId" value={staffId}/><button disabled={pending} className="inline-flex min-h-10 items-center rounded-xl border border-danger/30 px-3 py-2 text-sm font-semibold text-danger disabled:opacity-50">{pending ? "Disabling…" : "Disable login access"}</button><Feedback state={state}/></form></div>;
}

export function StaffLoginAccessPanel({ rows }: { rows: StaffAccessRows }) {
  return !rows.length ? <Empty>Create a staff profile first. Login access is optional and can be enabled later.</Empty> : <Table headers={["Staff profile", "Profile status", "Login access"]}>{rows.map(row => <tr key={row.staff_id}>
    <td><span className="font-semibold">{row.display_name}</span><span className="mt-1 block text-xs text-muted">{row.bookable ? "Available for bookings" : "Not bookable"}</span></td>
    <td>{row.active ? "Active" : "Inactive"}</td>
    <td className="min-w-0 lg:min-w-80">{row.login_enabled && row.email ? <DisableAccess staffId={row.staff_id} email={row.email}/> : row.login_enabled ? <p className="text-sm">Login access enabled</p> : <EnableAccess staffId={row.staff_id}/>}</td>
  </tr>)}</Table>;
}
