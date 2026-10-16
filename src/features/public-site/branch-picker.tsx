import Link from "next/link";
import type { PublicWebsite } from "./model";

export function PublicBranchPicker({ site, serviceSlug, account = false, invalidSelection = false }:
  { site: PublicWebsite; serviceSlug?: string; account?: boolean; invalidSelection?: boolean }) {
  const href = account ? "/account/book" : "/book";
  return <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
    <p className="eyebrow">Choose a location</p>
    <h1 className="display-type mt-3 text-4xl sm:text-5xl">Where would you like to visit?</h1>
    <p className="mt-3 max-w-2xl text-muted">Choose a branch to see its services, prices, team, and available appointment times.</p>
    {invalidSelection && <p role="alert" className="mt-6 rounded-xl bg-warning-soft p-4 text-sm">That location is no longer available for online booking. Choose one of the locations below.</p>}
    {site.branches?.length ? <div className="mt-8 grid gap-4 sm:grid-cols-2">
      {site.branches.map(branch => <Link key={branch.slug} href={`${href}?${new URLSearchParams({ branch: branch.slug, ...(serviceSlug ? { service: serviceSlug } : {}) })}`} className="surface-card block p-6 transition hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <span className="eyebrow">{branch.service_count} {branch.service_count === 1 ? "service" : "services"}</span>
        <span className="mt-2 block display-type text-2xl">{branch.name}</span>
        <span className="mt-3 block text-sm leading-6 text-muted">{branch.address || "Contact the location for directions."}</span>
        {(branch.contact_phone || branch.contact_email) && <span className="mt-4 block text-sm text-muted">{[branch.contact_phone, branch.contact_email].filter(Boolean).join(" · ")}</span>}
        <span className="button-primary mt-6 inline-flex">Book at this location</span>
      </Link>)}
    </div> : <div className="surface-card mt-8 p-6">
      <h2 className="text-lg font-semibold">Online booking is unavailable</h2>
      <p className="mt-2 text-sm leading-6 text-muted">No locations are currently set up for online booking. Please contact the business for help.</p>
    </div>}
  </main>;
}
