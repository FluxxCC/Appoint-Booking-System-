"use client";

import { useActionState, useId } from "react";
import type { FormState } from "@/features/auth/schemas";
import type { OwnerAdminAccount, OwnerBranchAccess } from "./admin-access-data.server";
import { inviteAdminAction, grantAdminAction, revokeAdminAction } from "@/features/staff/admin-access-actions";
import { saveAdminBranchMembershipAction } from "@/features/branches/actions";
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

function BranchMembershipToggle({ branchId, account, active }: { branchId: string; account: OwnerAdminAccount; active: boolean }) {
  const [state, action, pending] = useActionState(saveAdminBranchMembershipAction, {});
  return <form action={action} className="flex flex-col items-start gap-2 sm:items-end">
    <input type="hidden" name="branch_id" value={branchId}/><input type="hidden" name="target_id" value={account.user_id}/><input type="hidden" name="active" value={String(!active)}/>
    <button disabled={pending || !account.active} className={`min-h-10 rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${active ? "border-danger/30 text-danger hover:bg-danger-soft" : "border-line text-accent-dark hover:border-accent/40 hover:bg-accent-soft"}`}>
      {pending ? "Saving…" : active ? "Remove branch access" : "Give branch access"}
    </button>
    <Feedback state={state}/>
  </form>;
}

export function AdminAccessPanel({ accounts, branches, memberships }: { accounts: OwnerAdminAccount[] } & OwnerBranchAccess) {
  const admins = accounts.filter(account => account.is_administrator);
  const pendingInvites = accounts.filter(account => !account.is_administrator);
  return <>
    <PageHeading title="Administrator access" description="Only the owner can invite, activate or remove an administrator. Administrators need MFA before entering the business workspace."/>
    <div className="grid gap-5 xl:grid-cols-2"><Card title="Invite an administrator"><p className="mb-5 text-sm leading-6 text-muted">The invitation grants access after email confirmation and owner activation.</p><EmailInvite/></Card><Card title="Connect an existing account"><p className="mb-5 text-sm leading-6 text-muted">Use a verified account that is not already linked to another business role.</p><GrantExisting/></Card></div>
    <section className="mt-8"><h2 className="mb-4 text-xl font-semibold">Active and invited administrators</h2>{!accounts.length ? <Empty>No administrator accounts or invitations yet.</Empty> : <Table headers={["Email", "Status", "Email confirmation", "Action"]}>{[...admins, ...pendingInvites].map(account => <tr key={account.email}><td className="break-all font-medium">{account.email}</td><td>{account.status}</td><td>{account.email_confirmed ? "Confirmed" : "Not confirmed"}</td><td>{account.is_administrator ? <Revoke email={account.email}/> : account.email_confirmed && account.active ? <ActivateInvite email={account.email}/> : <span className="text-xs text-muted">Waiting for email confirmation</span>}</td></tr>)}</Table>}<p className="mt-4 max-w-3xl text-xs leading-5 text-muted">MFA is required for administrators and owners. Changes to this security requirement need a separate authorization and database review.</p></section>
    <section className="mt-8"><Card title="Branch access"><p className="-mt-2 mb-5 max-w-3xl text-sm leading-6 text-muted">Assign each active ADMIN account to the business locations it can manage. This scopes their workspace without changing their role.</p>{!branches.length ? <Empty>No branches are available.</Empty> : !admins.length ? <Empty>No administrator accounts are available for branch access.</Empty> : <div className="space-y-5">{branches.map(branch => <section key={branch.id} className="rounded-2xl border border-line p-4 sm:p-5"><h3 className="font-semibold text-ink">{branch.name}{branch.is_default ? " · Main location" : ""}</h3><ul className="mt-3 divide-y divide-line">{admins.map(account => { const active = memberships.some(row => row.branch_id === branch.id && row.auth_user_id === account.user_id && row.active); return <li key={account.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="break-all text-sm font-medium text-ink">{account.email}</p><p className="mt-1 text-xs text-muted">{!account.active ? "Account disabled" : active ? "Can manage this branch" : "No access to this branch"}</p></div><BranchMembershipToggle branchId={branch.id} account={account} active={active}/></li>; })}</ul></section>)}</div>}</Card></section>
  </>;
}
