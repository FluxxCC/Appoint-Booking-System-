import Link from "next/link";
import { BackButton } from "@/components/ui/back-button";
import { notFound } from "next/navigation";
import { z } from "zod";
import { readCatalog } from "./data.server";
import {
  AssignmentForm,
  BranchHomeServiceControl,
  BranchServiceOfferingForm,
  CategoryForm,
  ExceptionForm,
  ImageControl,
  RemoveException,
  ServiceForm,
  StaffBranchAssignmentControl,
  StaffForm,
} from "./forms";
import { CategoryOrderTable } from "./category-order-table";
import { HoursForm } from "@/features/admin/forms";
import { saveStaffHours } from "./actions";
import { PageHeading, Card, Empty, Table, Pagination, Time, AppointmentTable, buttonClass, inputClass } from "@/features/admin/ui";
import { money } from "@/features/admin/format";
import type { SearchParams } from "@/features/admin/data.server";

export async function CatalogList({ kind, search }: { kind: "services" | "staff"; search: SearchParams }) {
  const { data, filters, branchContext, principal } = await readCatalog(kind, search);
  const isOwner = principal.roles.includes("OWNER");
  const title = kind === "services" ? "Services" : "Staff";
  const branchOfferingByService = new Map((data.branch_offerings ?? []).map(offer => [offer.service_id, offer]));
  const scope = branchContext.selectedBranchName ?? branchContext.allLabel;

  return <>
    <PageHeading title={title} description={`${scope} · ${kind === "services" ? "Manage your catalog, prices and where each service is offered." : "Manage staff profiles, branch assignments, services and schedules."}`}>
      <div className="flex flex-wrap gap-3">
        <Link className={buttonClass} href={`/admin/${kind}/new`}>Add {kind === "services" ? "service" : "staff profile"}</Link>
        <Link className={buttonClass} href={kind === "services" ? "/admin/services/categories" : "/admin/staff/accounts"}>{kind === "services" ? "Categories" : "Staff login access"}</Link>
      </div>
    </PageHeading>

    {kind === "services" && branchContext.selectedBranchId && <Card title={`Home Service · ${branchContext.selectedBranchName ?? "Selected branch"}`}>
      <p className="-mt-2 mb-4 max-w-3xl text-sm leading-6 text-muted">The customer enters the visit address and map pin for each Home Service booking. Authorized staff and managers use that confirmed destination to navigate.</p>
      <BranchHomeServiceControl branchId={branchContext.selectedBranchId} branchName={branchContext.selectedBranchName ?? "this branch"} enabled={data.branch_home_service_enabled ?? false} isOwner={isOwner}/>
    </Card>}

    {kind === "services" && !branchContext.selectedBranchId && branchContext.branches.length > 1 && <p role="status" className="mb-6 rounded-xl border border-info/20 bg-info-soft/60 p-4 text-sm leading-6 text-ink">Choose one branch from the workspace selector to manage its Home Service availability and service prices.</p>}

    <Card title={title}>
      {kind === "services" && branchContext.selectedBranchId && <p className="-mt-2 mb-5 text-sm text-muted">Branch-specific service availability and price are managed in each service’s details.</p>}
      <form action={`/admin/${kind}`} method="get" role="search" className="mb-6 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">Search<input className={inputClass} name="q" placeholder={kind === "services" ? "Service name or URL name" : "Staff name"} defaultValue={filters.q}/></label>
        <label className="text-sm">Status<select className={inputClass} name="active" defaultValue={filters.active}><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive / archived</option></select></label>
        {kind === "services" && <label className="text-sm">Category<select className={inputClass} name="category" defaultValue={filters.category}><option value="">All categories</option>{data.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>}
        <div className="flex flex-wrap items-center gap-4"><button type="submit" className={buttonClass}>Apply filters</button><Link className="text-sm font-medium text-accent-dark underline-offset-4 hover:underline" href={`/admin/${kind}`}>Clear</Link></div>
      </form>
      {!data.total ? <Empty>No {kind} match this view.</Empty> : kind === "services" ? <Table headers={["Service", "Price / duration", "Fulfillment", "Home Service fee · travel", "Visibility", ...(branchContext.selectedBranchId ? [`${branchContext.selectedBranchName ?? "Branch"} offering`] : []), "Payment", "Actions"]}>
        {data.services?.map(service => {
          const offer = branchOfferingByService.get(service.id);
          return <tr key={service.id}>
            <td><Link className="font-medium text-accent-dark underline" href={`/admin/services/${service.id}`}>{service.name}</Link></td>
            <td>{money(service.price_amount, data.business?.currency ?? "PHP")} · {service.duration_minutes} min</td>
            <td><p>At business: {service.supports_business_location ? "Enabled" : "Disabled"}</p><p className="mt-1">Home Service: {service.supports_home_service ? "Enabled" : "Disabled"}</p></td>
            <td>{service.supports_home_service ? <>{money(service.home_service_fee, data.business?.currency ?? "PHP")}<p className="mt-1 text-xs text-muted">{service.home_travel_before_minutes} min before · {service.home_travel_after_minutes} min after</p></> : "—"}</td>
            <td>{service.active ? "Active" : "Archived"} · {service.published ? "Published" : "Unpublished"}</td>
            {branchContext.selectedBranchId && <td>{offer?.active ? <>{money(offer.effective_price, data.business?.currency ?? "PHP")}<p className="mt-1 text-xs text-success">Available at this branch</p></> : <span className="text-muted">Not offered at this branch</span>}</td>}
            <td>{service.payment_mode.replaceAll("_", " ").toLowerCase()}</td>
            <td><Link className="button-secondary inline-flex min-h-10 items-center whitespace-nowrap px-3 py-2 text-sm" href={`/admin/services/${service.id}`}>Edit service</Link></td>
          </tr>;
        })}
      </Table> : <Table headers={["Staff", "Status", "Public booking"]}>{data.staff?.map(person => <tr key={person.id}><td><Link className="font-medium text-accent-dark underline" href={`/admin/staff/${person.id}`}>{person.display_name}</Link></td><td>{person.active ? "Active" : "Inactive"}</td><td>{person.published && person.bookable ? "Enabled" : "Disabled"}</td></tr>)}</Table>}
      <Pagination path={`/admin/${kind}`} page={data.page} total={data.total} query={{ q: filters.q, active: filters.active, category: filters.category }}/>
    </Card>
  </>;
}

export async function CatalogEditor({ kind, id }: { kind: "services" | "staff"; id?: string }) {
  if (id && !z.uuid().safeParse(id).success) notFound();
  const { data, branchContext, principal } = await readCatalog(kind, {}, id);
  const service = kind === "services" ? data.services?.[0] : undefined;
  const staff = kind === "staff" ? data.staff?.[0] : undefined;
  const row = service ?? staff;
  if (id && !row) notFound();
  const zone = data.business?.timezone ?? "UTC";
  const isOwner = principal.roles.includes("OWNER");
  const branchOffer = data.branch_offerings?.find(offer => offer.service_id === id);

  return <>
    <PageHeading title={id ? `Edit ${kind === "services" ? "service" : "staff profile"}` : `Add ${kind === "services" ? "service" : "staff profile"}`} description={kind === "services" ? "Start with the service name, price and appointment length. Add booking options below if needed." : "Save profile details before adding images or schedules."}><BackButton href={`/admin/${kind}`}>Back to {kind}</BackButton></PageHeading>
    <div className="space-y-6">
      <Card title="Details">{kind === "services" ? <ServiceForm data={data} row={service}/> : <StaffForm row={staff}/>}</Card>
      {id && kind === "services" && <Card title="Branch availability">
        <p className="-mt-2 mb-4 max-w-3xl text-sm leading-6 text-muted">Choose whether this service is offered at the selected branch and set an optional branch price. Customers enter their own destination when booking Home Service.</p>
        {branchContext.selectedBranchId && service ? <BranchServiceOfferingForm branchId={branchContext.selectedBranchId} branchName={branchContext.selectedBranchName ?? "Selected branch"} service={service} offer={branchOffer} currency={data.business?.currency ?? "PHP"} isOwner={isOwner}/> : <p className="rounded-xl bg-canvas p-4 text-sm text-muted">Choose one branch from the workspace selector to manage branch-specific availability and pricing.</p>}
      </Card>}
      {id && row && <Card title="Public image"><ImageControl id={id} kind={kind} path={kind === "services" ? service?.image_path ?? null : staff?.photo_path ?? null}/></Card>}
      {id && kind === "services" && <Card title="Capable staff">
        {!data.assignments?.length ? <Empty>No staff assigned. Assign this service from a staff profile.</Empty> : <ul className="space-y-2">{data.assignments.map(assignment => <li key={assignment.staff_id}><Link className="text-accent-dark underline" href={`/admin/staff/${assignment.staff_id}`}>{data.staff_options.find(person => person.id === assignment.staff_id)?.display_name ?? "Staff"}</Link></li>)}</ul>}
        <Link className="mt-4 block text-sm text-accent-dark underline" href="/admin/staff">Manage staff assignments</Link>
      </Card>}
      {id && kind === "staff" && <>
        <Card title="Branch assignment">
          <p className="-mt-2 mb-4 max-w-3xl text-sm leading-6 text-muted">Choose whether this staff profile can receive appointments at the selected business location. This does not grant account access.</p>
          {branchContext.selectedBranchId ? <StaffBranchAssignmentControl branchId={branchContext.selectedBranchId} branchName={branchContext.selectedBranchName ?? "Selected branch"} staffId={id} active={data.branch_assignment_active ?? false} isOwner={isOwner}/> : <p className="rounded-xl bg-canvas p-4 text-sm text-muted">Choose one branch from the workspace selector to manage staff branch assignments.</p>}
        </Card>
        <Card title="Services offered">{branchContext.selectedBranchId ? <AssignmentForm id={id} data={data}/> : <p className="text-sm text-muted">Select one branch above to manage its service assignments.</p>}</Card>
        <Card title={`Regular schedule · ${zone}`}><p className="mb-4 text-sm text-muted">Effective availability is the intersection of business hours and staff hours, minus closures and unavailable periods.</p>{branchContext.selectedBranchId ? <HoursForm action={saveStaffHours} hidden={{ staff_id: id }} rows={(data.hours ?? []).map(hour => ({ weekday: hour.weekday, opens_at: hour.starts_at, closes_at: hour.ends_at }))}/> : <p className="text-sm text-muted">Select one branch above to manage its weekly hours.</p>}</Card>
        <Card title="Add break, leave or extra hours">{branchContext.selectedBranchId ? <ExceptionForm id={id} zone={zone}/> : <p className="text-sm text-muted">Select one branch above to add a branch-specific schedule exception.</p>}</Card>
        <Card title="Schedule exceptions (latest 100)">{!data.exceptions?.length ? <Empty>No exceptions.</Empty> : <div className="space-y-5">{data.exceptions.map(exception => <div key={exception.id} className="rounded-lg border p-4"><p>{exception.kind.replaceAll("_", " ")} · {exception.reason}</p><p className="mb-3 text-sm"><Time value={exception.starts_at} zone={zone}/> – <Time value={exception.ends_at} zone={zone}/></p>{branchContext.selectedBranchId && <RemoveException id={exception.id}/>}</div>)}</div>}</Card>
        <Card title="Upcoming appointments (next 25)"><AppointmentTable rows={data.upcoming ?? []} zone={zone}/></Card>
      </>}
    </div>
  </>;
}

export async function CategoriesPage() {
  const { data } = await readCatalog("services");
  return <>
    <PageHeading title="Service categories" description="Organize customer-facing service groups. Drag categories to set their order and control which ones customers can see."><BackButton href="/admin/services">Back to services</BackButton></PageHeading>
    <details className="surface-card mb-6 overflow-hidden">
      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:hidden sm:px-7 [&::-webkit-details-marker]:hidden">
        <span><span className="block font-semibold text-ink">Add category</span><span className="mt-1 block text-sm text-muted">Create a group for related services; it will be added at the end</span></span>
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-xl font-medium text-white">+</span>
      </summary>
      <div className="border-t border-line px-5 py-5 sm:px-7"><CategoryForm sortOrder={data.categories.length ? Math.max(...data.categories.map(category => category.sort_order)) + 1 : 0}/></div>
    </details>
    <Card title="Saved categories">
      {data.categories.length ? <CategoryOrderTable categories={data.categories}/> : <Empty>No categories yet. Add a category to organize your services.</Empty>}
      {Boolean(data.categories.length) && <p className="mt-4 text-xs leading-5 text-muted">Inactive categories are not available for new bookings. Hidden categories are not shown in the public service catalog.</p>}
    </Card>
  </>;
}

export async function CategoryEditor({ id }: { id: string }) {
  if (!z.uuid().safeParse(id).success) notFound();
  const { data } = await readCatalog("services");
  const row = data.categories.find(category => category.id === id);
  if (!row) notFound();
  return <><PageHeading title="Edit category" description="Update the category name or customer visibility. Drag it in the category list to change its position."><BackButton href="/admin/services/categories">Back to categories</BackButton></PageHeading><Card title={row.name}><CategoryForm row={row}/></Card></>;
}
