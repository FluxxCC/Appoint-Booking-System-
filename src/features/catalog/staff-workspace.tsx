import Link from "next/link";
import { readStaffWorkspace } from "./data.server";
import { Card, PageHeading, Empty, Table, Time, Status } from "@/features/admin/ui";
import type { StaffAppointment, StaffWorkspace } from "./types";
import { Form } from "@/features/admin/forms";
import { acceptAsStaff, declineAsStaff } from "@/features/appointments/actions";
import { formatClockTime } from "@/lib/time";
import {navigationUrl} from "@/lib/maps";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function Schedule({ data, today = false }: { data: StaffWorkspace; today?: boolean }) {
  const weekday = new Date(`${data.date}T12:00:00Z`).getUTCDay();
  const showBranches = Boolean(data.branchContext && !data.branchContext.selectedBranchId && data.branchContext.branches.length > 1);
  if (showBranches) {
    const daysToShow = days.map((day, index) => ({ day, index })).filter(({ index }) => !today || index === weekday);
    return <Table headers={["Branch", "Day", "Your hours", "Business hours"]}>{data.branchContext!.branches.flatMap(branch => daysToShow.map(({ day, index }) => {
      const staffHours=data.hours.filter(hour=>hour.branch_id===branch.id&&hour.weekday===index);
      const businessHours=data.business_hours.filter(hour=>hour.branch_id===branch.id&&hour.weekday===index);
      return <tr key={`${branch.id}-${day}`}><td className="font-medium">{branch.name}</td><td>{day}</td><td>{staffHours.map(hour => `${formatClockTime(hour.starts_at)}–${formatClockTime(hour.ends_at)}`).join(", ") || "Off"}</td><td>{businessHours.map(hour => `${formatClockTime(hour.opens_at)}–${formatClockTime(hour.closes_at)}`).join(", ") || "Closed"}</td></tr>;
    }))}</Table>;
  }
  return <Table headers={["Day", "Your hours", "Business hours"]}>{days.map((day, index) => (!today || index === weekday) && <tr key={day}>
    <td className="font-medium">{day}</td>
    <td>{data.hours.filter(hour => hour.weekday === index).map(hour => `${formatClockTime(hour.starts_at)}–${formatClockTime(hour.ends_at)}`).join(", ") || "Off"}</td>
    <td>{data.business_hours.filter(hour => hour.weekday === index).map(hour => `${formatClockTime(hour.opens_at)}–${formatClockTime(hour.closes_at)}`).join(", ") || "Closed"}</td>
  </tr>)}</Table>;
}

function Appointments({ rows, zone, empty = "No appointments in this view.", anchors = false, focusId }: { rows: StaffAppointment[]; zone: string; empty?: string; anchors?: boolean; focusId?: string }) {
  const showBranches=rows.some(appointment=>appointment.branch_name);
  return !rows.length ? <Empty>{empty}</Empty> : <Table headers={["Customer / service", ...(showBranches?["Branch"]:[]), "Start / end", "Status"]}>{rows.map(appointment => <tr key={appointment.id} id={anchors ? `appointment-${appointment.id}` : undefined} className={focusId === appointment.id ? "bg-accent-soft" : undefined}>
    <td><span className="font-semibold">{appointment.customer_name}</span><p className="mt-1 text-xs text-muted">{appointment.service_name}</p><HomeServiceInfo appointment={appointment}/></td>
    {showBranches&&<td>{appointment.branch_name??"Assigned branch"}</td>}
    <td><Time value={appointment.starts_at} zone={zone}/><p className="mt-1 text-xs text-muted">Until <Time value={appointment.ends_at} zone={zone}/></p></td>
    <td><Status value={appointment.state}/></td>
  </tr>)}</Table>;
}

function RequestQueue({ data, focusId }: { data: StaffWorkspace; focusId?: string }) {
  const showBranches=Boolean(data.branchContext&&!data.branchContext.selectedBranchId&&data.branchContext.branches.length>1);
  return <Card title="Your pending requests">
    <p className="mb-5 max-w-2xl text-sm leading-6 text-muted">A request does not reserve a time. Accepting it checks availability again and reserves the slot when successful.</p>
    {data.pending.length ? <div className="space-y-3">{data.pending.map(appointment => <article key={appointment.id} id={`appointment-${appointment.id}`} className={`rounded-2xl border border-line bg-canvas/50 p-4 sm:p-5 ${focusId === appointment.id ? "ring-2 ring-accent" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{appointment.customer_name}</h3><p className="mt-1 text-sm text-muted">{appointment.service_name} · <Time value={appointment.starts_at} zone={data.timezone}/></p>{showBranches&&<p className="mt-1 text-xs font-medium text-accent-dark">{appointment.branch_name??"Assigned branch"}</p>}</div><Status value={appointment.state}/></div>
      <HomeServiceInfo appointment={appointment}/><div className="mt-5 grid gap-5 border-t border-line pt-5 sm:grid-cols-2"><Form action={acceptAsStaff} hidden={{ appointmentId: appointment.id }} fields={[]} submit="Accept request"/><Form action={declineAsStaff} hidden={{ appointmentId: appointment.id }} fields={[{ name: "reason", label: "Reason for declining", type: "textarea", required: true, maxLength: 1000 }]} submit="Decline request"/></div>
    </article>)}</div> : <Empty>No requests assigned to you.</Empty>}
  </Card>;
}

function HomeServiceInfo({appointment}:{appointment:StaffAppointment}){
 if(appointment.fulfillment_mode!=="HOME_SERVICE")return null;
 const point=appointment.home_location;
 return <div className="mt-2 rounded-lg bg-accent-soft/50 p-3 text-xs leading-5"><p className="font-semibold">Home Service</p>{point?<><p>{point.address}</p>{point.landmark&&<p>Landmark: {point.landmark}</p>}{point.instructions&&<p>Instructions: {point.instructions}</p>}<a className="font-semibold text-accent-dark underline" target="_blank" rel="noreferrer" href={navigationUrl(point)}>Open in Maps</a></>:<p>Service area: {appointment.service_area_hint??"area available after request review"}. Precise address is available after the request is accepted.</p>}</div>;
}

export async function StaffDashboard() {
  const data = await readStaffWorkspace();
  const scope=data.branchContext?.selectedBranchName??data.branchContext?.allLabel??"Assigned branch";
  const next = data.upcoming.find(appointment => appointment.starts_at >= new Date().toISOString());
  const laterToday = data.today.filter(appointment => appointment.id !== next?.id);
  return <><PageHeading title="Your day" description={`${scope} · ${data.date} · ${data.timezone}.`}><div className="flex flex-wrap gap-2"><Link href="/staff/calendar" className="button-secondary min-h-11">View schedule</Link><Link href="/staff/availability" className="button-secondary min-h-11">View availability</Link></div></PageHeading>
    <section className="relative overflow-hidden rounded-[1.35rem] border border-line bg-gradient-to-br from-accent-soft via-surface to-sand p-6 sm:p-8"><div aria-hidden="true" className="absolute -right-12 -top-14 size-48 rounded-full bg-white/70"/><div className="relative"><p className="eyebrow">Next on your schedule</p>{next ? <><div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><h2 className="display-type text-3xl sm:text-4xl">{next.customer_name}</h2><p className="mt-2 text-muted">{next.service_name}</p></div><Status value={next.state}/></div><div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-5 text-sm"><span className="font-semibold text-accent-dark"><Time value={next.starts_at} zone={data.timezone}/></span><span className="text-muted">Until <Time value={next.ends_at} zone={data.timezone}/></span></div></> : <><h2 className="display-type mt-5 text-3xl">You’re all caught up.</h2><p className="mt-3 max-w-md text-sm leading-6 text-muted">Your next confirmed appointment will appear here when one is scheduled.</p></>}</div></section>
    {data.approval_mode === "STAFF_APPROVAL" && <Link href="/staff/appointments" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/30 bg-warning-soft p-4 text-sm"><span><strong>{data.pending.length} requests</strong> need your review.</span><span className="font-semibold text-accent-dark">Review requests →</span></Link>}
    <div className="mt-7"><Card title="Later today"><Appointments rows={laterToday} zone={data.timezone} empty={next ? "No other appointments scheduled today." : "No appointments scheduled for today."}/></Card></div>
  </>;
}

export async function StaffCalendar() {
  const data = await readStaffWorkspace();
  const scope=data.branchContext?.selectedBranchName??data.branchContext?.allLabel??"Assigned branch";
  const formatDay = new Intl.DateTimeFormat("en", { timeZone: data.timezone, weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const groups = new Map<string, StaffAppointment[]>();
  for (const appointment of data.upcoming) {
    const day = formatDay.format(new Date(appointment.starts_at));
    groups.set(day, [...(groups.get(day) ?? []), appointment]);
  }
  return <><PageHeading title="Your schedule" description={`${scope} · Upcoming assigned appointments · ${data.timezone}. Pending requests are listed separately because they do not hold a slot.`}><Link href="/staff/appointments" className="button-secondary">View requests</Link></PageHeading>
    {groups.size ? <div className="space-y-5">{[...groups].map(([day, appointments]) => <section key={day} className="surface-card overflow-hidden"><h2 className="border-b border-line bg-canvas/60 px-5 py-4 text-lg font-semibold sm:px-7">{day}</h2><ol className="divide-y divide-line">{appointments.map(appointment => <li key={appointment.id} className="grid gap-3 px-5 py-5 sm:grid-cols-[minmax(130px,.35fr)_minmax(0,1fr)_auto] sm:items-center sm:px-7"><p className="text-sm font-semibold text-accent-dark"><Time value={appointment.starts_at} zone={data.timezone}/></p><div><p className="font-semibold">{appointment.customer_name}</p><p className="mt-1 text-sm text-muted">{appointment.service_name}</p>{data.branchContext?.branches.length&&data.branchContext.branches.length>1&&!data.branchContext.selectedBranchId&&<p className="mt-1 text-xs font-medium text-accent-dark">{appointment.branch_name??"Assigned branch"}</p>}</div><Status value={appointment.state}/></li>)}</ol></section>)}</div> : <Card title="Upcoming schedule"><Empty>No appointments are scheduled yet.</Empty></Card>}
    <p className="mt-5 text-sm text-muted">Showing up to 100 upcoming assigned appointments.</p>
  </>;
}

export async function StaffAppointmentsPage({ focusId }: { focusId?: string } = {}) {
  const data = await readStaffWorkspace();
  const scope=data.branchContext?.selectedBranchName??data.branchContext?.allLabel??"Assigned branch";
  return <><PageHeading title="Requests" description={`${scope} · Appointment requests assigned to you · ${data.timezone}.`}><Link href="/staff/calendar" className="button-secondary min-h-11">View schedule</Link></PageHeading><div className="space-y-6">
    {data.approval_mode === "STAFF_APPROVAL" ? <RequestQueue data={data} focusId={focusId}/> : <Card title="Pending requests"><p className="mb-4 text-sm text-muted">The business approval policy determines who can review requests.</p><Appointments rows={data.pending} zone={data.timezone} empty="No pending requests assigned to you." anchors focusId={focusId}/></Card>}
  </div></>;
}

export async function StaffAvailability() {
  const data = await readStaffWorkspace();
  const scope=data.branchContext?.selectedBranchName??data.branchContext?.allLabel??"Assigned branch";
  return <><PageHeading title="Your availability" description={`${scope} · Hours use ${data.timezone}. An owner or administrator can change your schedule.`}/><div className="space-y-6"><Card title="Regular hours"><Schedule data={data}/><p className="mt-4 text-sm leading-6 text-muted">Available booking time is the overlap of your working hours and business hours, excluding closures, exceptions and reservations.</p></Card><Card title="Upcoming changes">{!data.exceptions.length ? <Empty>No breaks, leave or extra hours are scheduled.</Empty> : <Table headers={["Type / reason", "Start", "End"]}>{data.exceptions.map(exception => <tr key={exception.id}><td className="font-medium">{exception.kind.replaceAll("_", " ")}<p className="mt-1 text-xs font-normal text-muted">{exception.reason}</p></td><td><Time value={exception.starts_at} zone={data.timezone}/></td><td><Time value={exception.ends_at} zone={data.timezone}/></td></tr>)}</Table>}</Card></div></>;
}
