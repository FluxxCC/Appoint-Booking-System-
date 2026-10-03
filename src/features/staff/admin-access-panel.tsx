"use client";

import { useActionState, useId } from "react";
import type { FormState } from "@/features/auth/schemas";
import type { OwnerAdminAccount } from "./admin-access-data.server";
import { inviteAdminAction, grantAdminAction, revokeAdminAction } from "@/features/staff/admin-access-actions";
import { Card, Empty, PageHeading, Table } from "@/features/admin/ui";

function Feedback({ state }: { state: FormState }) {
  return <>{state.error && <p role="alert" className="mt-3 rounded-xl bg-danger-soft p-3 text-sm text-danger">{state.error}</p>}{state.success && <p role="status" className="mt-3 rounded-xl bg-success-soft p-3 text-sm text-success">{state.success}</p>}</>;
}

function EmailInvite() {
  const [state, action, pending] = useActionState(inviteAdminAction, {});
  const id = useId();
  return <form action={action} className="space-y-4"><label htmlFor={id} className="block text-sm font-medium">Email address</label><input id={id} name="email" type="email" required maxLength={254} autoComplete="off" className="field-control"/><button disabled={pending} className="button-primary disabled:opacity-50">{pending ? "Sending…" : "Invite administrator"}</button><Feedback state={state}/></form>;
}

function GrantExisting() {
  const [state, action, pending] = useActionState(grantAdminAction, {});
  const id = useId();
  return <form action={action} className="space-y-4"><label htmlFor={id} className="block text-sm font-medium">Confirmed account email</label><input id={id} name="email" type="email" required maxLength={254} autoComplete="email" className="field-control"/><p className="text-xs leading-5 text-muted">The account must be confirmed, active, and separate from other privileged roles or staff profiles.</p><button disabled={pending} className="button-secondary disabled:opacity-50">{pending ? "Granting…" : "Grant access"}</button><Feedback state={state}/></form>;
}

function ActivateInvite({ email }: { email: string }) {
  const [state, action, pending] = useActionState(grantAdminAction, {});
  return <form action={action} className="space-y-2"><input type="hidden" name="email" value={email}/><button disabled={pending} className="button-secondary min-h-10 px-3 py-2 disabled:opacity-50">{pending ? "Activating…" : "Activate"}</button><Feedback state={state}/></form>;
}

function Revoke({ email }: { email: string }) {
  const [state, action, pending] = useActionState(revokeAdminAction, {});
  return <form action={action} className="space-y-2"><input type="hidden" name="email" value={email}/><button disabled={pending} className="inline-flex min-h-10 items-center rounded-xl border border-danger/30 px-3 py-2 text-sm font-semibold text-danger disabled:opacity-50" aria-label={`Remove administrator access from ${email}`}>{pending ? "Removing…" : "Remove access"}</button><Feedback state={state}/></form>;
}

export function AdminAccessPanel({ accounts }: { accounts: OwnerAdminAccount[] }) {
  const admins = accounts.filter(account => account.is_administrator);
  const pendingInvites = accounts.filter(account => !account.is_administrator);
  return <>
    <PageHeading title="Administrator access" description="Only the owner can invite, activate or remove an administrator. Administrators need MFA before entering the business workspace."/>
    <div className="grid gap-5 xl:grid-cols-2"><Card title="Invite an administrator"><p className="mb-5 text-sm leading-6 text-muted">The invitation grants access after email confirmation and owner activation.</p><EmailInvite/></Card><Card title="Connect an existing account"><p className="mb-5 text-sm leading-6 text-muted">Use a verified account that is not already linked to another business role.</p><GrantExisting/></Card></div>
    <section className="mt-8"><h2 className="mb-4 text-xl font-semibold">Active and invited administrators</h2>{!accounts.length ? <Empty>No administrator accounts or invitations yet.</Empty> : <Table headers={["Email", "Status", "Email confirmation", "Action"]}>{[...admins, ...pendingInvites].map(account => <tr key={account.email}><td className="break-all font-medium">{account.email}</td><td>{account.status}</td><td>{account.email_confirmed ? "Confirmed" : "Not confirmed"}</td><td>{account.is_administrator ? <Revoke email={account.email}/> : account.email_confirmed && account.active ? <ActivateInvite email={account.email}/> : <span className="text-xs text-muted">Waiting for email confirmation</span>}</td></tr>)}</Table>}<p className="mt-4 max-w-3xl text-xs leading-5 text-muted">MFA is required for administrators and owners. Changes to this security requirement need a separate authorization and database review.</p></section>
  </>;
}
