"use client";

import { useActionState, useId } from "react";
import Link from "next/link";
import { buttonClass, Card, Empty, PageHeading } from "@/features/admin/ui";
import type { FormState } from "@/features/auth/schemas";
import { deleteEmptyBranchAction, saveBranchAction } from "./actions";
import type { ManagedBranch } from "./data.server";

function Feedback({ state }: { state: FormState }) {
  return <>{state.error && <p role="alert" className="mt-3 rounded-xl bg-danger-soft p-3 text-sm leading-5 text-danger">{state.error}</p>}{state.success && <p role="status" className="mt-3 rounded-xl bg-success-soft p-3 text-sm leading-5 text-success">{state.success}</p>}</>;
}

function ReadOnlyValue({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-line bg-canvas/70 px-3.5 py-3"><p className="text-xs font-medium text-muted">{label}</p><p className="mt-1 break-words text-sm font-medium text-ink">{value || "Not set"}</p></div>;
}

function BranchBasicsForm({ branch }: { branch?: ManagedBranch }) {
  const [state, action, pending] = useActionState(saveBranchAction, {});
  const id = useId();
  const isDefault = branch?.is_default ?? false;
  const value = {
    name: branch?.name ?? "",
    address: branch?.address ?? "",
    contact_email: branch?.contact_email ?? "",
    contact_phone: branch?.contact_phone ?? "",
    timezone: branch?.timezone ?? "Asia/Manila",
    service_origin_latitude: branch?.service_origin_latitude == null ? "" : String(branch.service_origin_latitude),
    service_origin_longitude: branch?.service_origin_longitude == null ? "" : String(branch.service_origin_longitude),
    home_service_max_radius_km: branch?.home_service_max_radius_km == null ? "" : String(branch.home_service_max_radius_km),
  };
  const field = (name: "name" | "address" | "contact_email" | "contact_phone" | "timezone", label: string, type = "text", hint?: string) => {
    const inputId = `${id}-${name}`;
    return <label htmlFor={inputId} className="block text-sm font-medium text-ink">{label}<input id={inputId} name={name} type={type} defaultValue={value[name]} maxLength={name === "address" ? 1000 : 254} className="field-control mt-1.5 text-sm" aria-describedby={hint ? `${inputId}-hint` : undefined}/>{hint && <span id={`${inputId}-hint`} className="mt-1 block text-xs leading-5 text-muted">{hint}</span>}</label>;
  };

  return <form action={action} aria-busy={pending} className="space-y-5">
    <input type="hidden" name="branch_id" value={branch?.id ?? ""}/>
    <input type="hidden" name="expected_updated_at" value={branch?.updated_at ?? ""}/>
    <input type="hidden" name="is_active" value={String(branch?.is_active ?? false)}/>
    <input type="hidden" name="booking_enabled" value={String(branch?.booking_enabled ?? false)}/>
    <input type="hidden" name="public_visible" value={String(branch?.public_visible ?? false)}/>
    <input type="hidden" name="approval_mode" value={branch?.approvalSettings?.approval_mode ?? "ADMIN_APPROVAL"}/>
    {/* Keep legacy fields unchanged while the existing database function still requires them. They are not customer destinations. */}
    <input type="hidden" name="service_origin_latitude" value={value.service_origin_latitude}/>
    <input type="hidden" name="service_origin_longitude" value={value.service_origin_longitude}/>
    <input type="hidden" name="home_service_max_radius_km" value={value.home_service_max_radius_km}/>
    <fieldset disabled={pending} className="space-y-5">
      <div className={branch ? "" : "max-w-2xl"}>{field("name", "Location name")}</div>
      {!branch && <p className="-mt-3 text-xs leading-5 text-muted">Booking links are created automatically from the location name.</p>}
      {isDefault ? <>
        <p className="rounded-xl bg-accent-soft/60 p-4 text-sm leading-6 text-muted">This address identifies your business location. For Home Service, customers enter the visit address with each booking. Update the business address in <Link href="/admin/settings" className="font-semibold text-accent-dark underline underline-offset-4">Business Settings</Link>.</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <ReadOnlyValue label="Business location address" value={value.address}/>
          <ReadOnlyValue label="Contact email" value={value.contact_email}/>
          <ReadOnlyValue label="Contact phone" value={value.contact_phone}/>
          <ReadOnlyValue label="Timezone" value={value.timezone}/>
          <ReadOnlyValue label="Booking status" value={branch?.booking_enabled ? "Available" : "Unavailable"}/>
        </div>
      </> : <>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("address", "Business location address", "text", "This is the branch address. Home Service customers enter their own visit address when booking.")}
          {field("contact_email", "Branch contact email", "email")}
          {field("contact_phone", "Branch contact phone", "tel")}
          {field("timezone", "Timezone", "text", "For example, Asia/Manila or America/Los_Angeles.")}
        </div>
      </>}
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <button disabled={pending} className={`${buttonClass} min-h-11 px-5 py-2.5`}>{pending ? "Saving…" : branch ? "Save location details" : "Create draft branch"}</button>
        {branch && <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${branch.is_active ? "bg-success-soft text-success" : "bg-canvas text-muted"}`}>{branch.is_active ? "Active" : "Draft · not bookable"}</span>}
      </div>
    </fieldset>
    <Feedback state={state}/>
  </form>;
}

function DeleteEmptyBranchForm({ branch }: { branch: ManagedBranch }) {
  const [state, action, pending] = useActionState(deleteEmptyBranchAction, {});
  return <form action={action} aria-busy={pending} onSubmit={event => {
    if (!window.confirm(`Delete the empty draft “${branch.name}”? Branches with bookings, service assignments, schedules, staff, or administrator access cannot be deleted.`)) {
      event.preventDefault();
    }
  }} className="mt-5 border-t border-line pt-5">
    <input type="hidden" name="branch_id" value={branch.id}/>
    <p className="max-w-3xl text-sm leading-6 text-muted">Only unpublished, inactive drafts with no bookings, service assignments, schedules, staff, or administrator access can be deleted. Audit records are retained.</p>
    <button type="submit" disabled={pending} className="mt-4 min-h-10 rounded-xl border border-danger/30 px-4 py-2 text-sm font-semibold text-danger transition hover:bg-danger-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:opacity-60">
      {pending ? "Deleting…" : "Delete empty draft"}
    </button>
    <Feedback state={state}/>
  </form>;
}

export function BranchManagementPanel({ branches }: { branches: ManagedBranch[] }) {
  return <>
    <PageHeading title="Branches" description="Manage your business locations and contact details. Home Service customers enter their visit destination when booking."/>
    <Card title="Add a location">
      <p className="-mt-2 mb-5 max-w-3xl text-sm leading-6 text-muted">New locations start as drafts. Set up services, staff and access from their menus when you’re ready.</p>
      <BranchBasicsForm/>
    </Card>
    <section className="mt-8 space-y-5" aria-labelledby="branch-list-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 id="branch-list-heading" className="text-xl font-semibold text-ink">Your locations</h2><span className="text-sm text-muted">{branches.length}</span></div>
      {branches.length ? branches.map(branch => <Card key={branch.id} title={branch.is_default ? `${branch.name} · Main location` : branch.name}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <ReadOnlyValue label="Address" value={branch.address ?? ""}/>
          <ReadOnlyValue label="Contact email" value={branch.contact_email ?? ""}/>
          <ReadOnlyValue label="Contact phone" value={branch.contact_phone ?? ""}/>
          <ReadOnlyValue label="Timezone" value={branch.timezone}/>
          <ReadOnlyValue label="Booking status" value={branch.booking_enabled ? "Available" : branch.is_default ? "Unavailable" : "Draft · not bookable"}/>
        </div>
        <details className="mt-5 border-t border-line pt-4">
          <summary className="w-fit cursor-pointer text-sm font-semibold text-accent-dark underline-offset-4 hover:underline">Manage location</summary>
          <div className="mt-5"><BranchBasicsForm branch={branch}/>{!branch.is_default && <DeleteEmptyBranchForm branch={branch}/>}</div>
        </details>
      </Card>) : <Empty>No branches found yet.</Empty>}
    </section>
  </>;
}

