"use client";

import { useActionState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { Area } from "@/lib/auth/access";
import type { WorkspaceBranchContext } from "./workspace-context.server";
import { setWorkspaceBranchAction } from "./workspace-actions";

export function WorkspaceBranchPicker({ area, context }: { area: Area; context: WorkspaceBranchContext }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, action, pending] = useActionState(setWorkspaceBranchAction, {});
  if (area === "account") return null;
  if (context.unavailable) return <p role="status" className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">No active branch is assigned to this workspace.</p>;
  if (!context.selectorVisible) return <p className="text-sm font-semibold text-ink">{context.warning ?? `Branch · ${context.selectedBranchName ?? context.branches[0]?.name ?? "Assigned branch"}`}</p>;
  const search = searchParams.toString();
  const returnTo = `${pathname}${search ? `?${search}` : ""}`;
  const selection = context.selectedBranchId ?? "all";

  return <div className="flex min-w-0 flex-col gap-2 sm:items-end">
    <form action={action} className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
      <input type="hidden" name="returnTo" value={returnTo} />
      <label className="min-w-0 text-xs font-semibold text-muted">
        Workspace branch
        <select name="branch_id" defaultValue={selection} className="mt-1 block min-h-10 w-full min-w-0 rounded-xl border border-line bg-white px-3 text-sm font-medium text-ink shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 sm:min-w-56" aria-label="Workspace branch">
          <option value="all">{context.allLabel}</option>
          {context.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_default ? " · Main location" : !branch.is_active ? " · Setup only" : ""}</option>)}
        </select>
      </label>
      <button type="submit" disabled={pending} className="button-secondary min-h-10 px-4 text-sm disabled:cursor-wait disabled:opacity-60">{pending ? "Switching…" : "Switch"}</button>
    </form>
    {context.warning && <p role="status" className="text-xs text-warning">{context.warning}</p>}
    {state.error && <p role="alert" className="text-xs text-danger">{state.error}</p>}
  </div>;
}
