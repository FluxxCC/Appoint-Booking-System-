import Link from "next/link";
import { PageHeading, Empty } from "@/features/admin/ui";
import { readHomeServiceData } from "./data.server";
import type { SearchParams } from "@/features/admin/data.server";
import { DispatchWorkspace } from "./dispatch-workspace";

const statusOptions = ["PENDING", "ACCEPTED", "AWAITING_PAYMENT", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"] as const;
const statusLabel = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());

export async function HomeServicePage({ area, search }: { area: "admin" | "staff"; search: SearchParams }) {
  const data = await readHomeServiceData(area, search).catch(() => null);
  if (!data) return <><PageHeading title="Home Service" description="Dispatch map and active home visits."/><section role="alert" className="rounded-2xl border border-warning/30 bg-warning-soft p-5 text-sm">Home Service bookings could not be loaded. Check branch access and the database migration.</section></>;
  const values = data.filters;
  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    if (values.date) params.set("date", values.date);
    if (values.status) params.set("status", values.status);
    if (area === "admin" && values.staff) params.set("staff", values.staff);
    if (page > 1) params.set("page", String(page));
    return `/${area}/home-service${params.size ? `?${params}` : ""}`;
  };
  const pages = Math.ceil(data.total / 25);
  return <><PageHeading title="Home Service" description={`${data.branchContext.selectedBranchName ?? data.branchContext.allLabel} · Dispatch and live trip status.`}/>
    <section className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-accent/20 bg-accent-soft/40 p-5"><div><p className="eyebrow">Active bookings requiring attention</p><p className="mt-1 text-3xl font-semibold tabular-nums text-accent-dark">{data.active_count}</p></div><p className="max-w-xl text-sm leading-6 text-muted">Counts refresh from the authorized server when appointments change. A trip marker shows the staff member’s latest shared point while its session is active.</p></section>
    <form action={`/${area}/home-service`} method="get" className="surface-card mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
      <label className="text-sm font-medium">Date<input type="date" name="date" defaultValue={values.date} className="mt-1.5 min-h-11 w-full rounded-control border border-line bg-surface px-3"/></label>
      <label className="text-sm font-medium">Status<select name="status" defaultValue={values.status} className="mt-1.5 min-h-11 w-full rounded-control border border-line bg-surface px-3"><option value="">All active statuses</option>{statusOptions.map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
      {area === "admin" ? <label className="text-sm font-medium">Assigned staff<select name="staff" defaultValue={values.staff} className="mt-1.5 min-h-11 w-full rounded-control border border-line bg-surface px-3"><option value="">All staff</option>{data.staff_options.map(person => <option key={person.id} value={person.id}>{person.display_name}</option>)}</select></label> : <input type="hidden" name="staff" value=""/>}
      <div className="flex gap-3"><button className="button-primary min-h-11 flex-1">Apply filters</button><Link className="button-secondary min-h-11" href={`/${area}/home-service`}>Clear</Link></div>
    </form>
    {data.appointments.length ? <DispatchWorkspace appointments={data.appointments} area={area} branchId={data.branchContext.selectedBranchId}/> : <div className="surface-card p-8 text-center"><Empty>{data.active_count ? "No active Home Service bookings match these filters." : "No active Home Service bookings."}</Empty></div>}
    {pages > 1 && <nav aria-label="Home Service pages" className="mt-6 flex items-center justify-between"><Link aria-disabled={data.page <= 1} className={`button-secondary ${data.page <= 1 ? "pointer-events-none opacity-50" : ""}`} href={pageHref(Math.max(1, data.page - 1))}>Previous</Link><span className="text-sm text-muted">Page {data.page} of {pages}</span><Link aria-disabled={data.page >= pages} className={`button-secondary ${data.page >= pages ? "pointer-events-none opacity-50" : ""}`} href={pageHref(Math.min(pages, data.page + 1))}>Next</Link></nav>}
  </>;
}
