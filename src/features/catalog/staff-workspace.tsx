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
  return <Table headers={["Day", "Your hours", "Business hours"]}>{days.map((day, index) => (!today || index === weekday) && <tr key={day}>
    <td className="font-medium">{day}</td>
    <td>{data.hours.filter(hour => hour.weekday === index).map(hour => `${formatClockTime(hour.starts_at)}–${formatClockTime(hour.ends_at)}`).join(", ") || "Off"}</td>
    <td>{data.business_hours.filter(hour => hour.weekday === index).map(hour => `${formatClockTime(hour.opens_at)}–${formatClockTime(hour.closes_at)}`).join(", ") || "Closed"}</td>
  </tr>)}</Table>;
}

function Appointments({ rows, zone, empty = "No appointments in this view.", anchors = false, focusId }: { rows: StaffAppointment[]; zone: string; empty?: string; anchors?: boolean; focusId?: string }) {
  return !rows.length ? <Empty>{empty}</Empty> : <Table headers={["Customer / service", "Start / end", "Status"]}>{rows.map(appointment => <tr key={appointment.id} id={anchors ? `appointment-${appointment.id}` : undefined} className={focusId === appointment.id ? "bg-accent-soft" : undefined}>
    <td><span className="font-semibold">{appointment.customer_name}</span><p className="mt-1 text-xs text-muted">{appointment.service_name}</p><HomeServiceInfo appointment={appointment}/></td>
    <td><Time value={appointment.starts_at} zone={zone}/><p className="mt-1 text-xs text-muted">Until <Time value={appointment.ends_at} zone={zone}/></p></td>
    <td><Status value={appointment.state}/></td>
  </tr>)}</Table>;
}

function RequestQueue({ data, focusId }: { data: StaffWorkspace; focusId?: string }) {
  return <Card title="Your pending requests">
    <p className="mb-5 max-w-2xl text-sm leading-6 text-muted">A request does not reserve a time. Accepting it checks availability again and reserves the slot when successful.</p>
    {data.pending.length ? <div className="space-y-3">{data.pending.map(appointment => <article key={appointment.id} id={`appointment-${appointment.id}`} className={`rounded-2xl border border-line bg-canvas/50 p-4 sm:p-5 ${focusId === appointment.id ? "ring-2 ring-accent" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{appointment.customer_name}</h3><p className="mt-1 text-sm text-muted">{appointment.service_name} · <Time value={appointment.starts_at} zone={data.timezone}/></p></div><Status value={appointment.state}/></div>
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
  const next = data.upcoming.find(appointment => appointment.starts_at >= new Date().toISOString());
  const metrics: [string, number, string, string][] = [
    ["Today", data.stats.today, "bg-info-soft", "text-info"],
    ["Requests", data.stats.pending, "bg-warning-soft", "text-warning"],
    ["Confirmed", data.stats.confirmed, "bg-success-soft", "text-success"],
    ["Coming up", data.stats.upcoming, "bg-accent-soft", "text-accent-dark"],
  ];
  return <><PageHeading title="Your day" description={`Your appointments and working hours for ${data.date} · ${data.timezone}.`}><Link href="/staff/calendar" className="button-secondary min-h-11">View schedule</Link></PageHeading>
  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(270px,1fr)]">
    <section className="relative overflow-hidden rounded-[1.35rem] border border-[#ccd5ff] bg-gradient-to-br from-[#e8edff] via-white to-[#f4f6ff] p-6 sm:p-8"><div aria-hidden="true" className="absolute -right-12 -top-14 size-48 rounded-full bg-white/70"/><div className="relative"><p className="eyebrow">Next on your schedule</p>{next ? <><div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><h2 className="display-type text-3xl sm:text-4xl">{next.customer_name}</h2><p className="mt-2 text-muted">{next.service_name}</p></div><Status value={next.state}/></div><div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#dce3ff] pt-5 text-sm"><span className="font-semibold text-accent-dark"><Time value={next.starts_at} zone={data.timezone}/></span><span className="text-muted">Until <Time value={next.ends_at} zone={data.timezone}/></span></div></> : <><h2 className="display-type mt-5 text-3xl">You’re all caught up.</h2><p className="mt-3 max-w-md text-sm leading-6 text-muted">Your next confirmed appointment will appear here when one is scheduled.</p></>}</div></section>
    <div className="grid grid-cols-2 gap-3">{metrics.map(([label, value, dotTone, textTone]) => <section key={label} className="surface-card flex min-w-0 flex-col justify-between p-4 sm:p-5"><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium text-muted">{label}</p><span aria-hidden="true" className={`size-2.5 rounded-full ${dotTone}`}/></div><p className={`mt-3 text-3xl font-semibold tracking-tight ${textTone}`}>{value}</p></section>)}</div>
  </div>
  <div className="mt-7 space-y-6"><Card title="Today’s appointments"><Appointments rows={data.today} zone={data.timezone} empty="No appointments scheduled for today."/></Card>
    {data.approval_mode === "STAFF_APPROVAL" && <RequestQueue data={data}/>}
    <div className="grid gap-6 xl:grid-cols-2"><Card title="Working hours today"><Schedule data={data} today/></Card><Card title="Coming up"><Appointments rows={data.upcoming.slice(0, 5)} zone={data.timezone} empty="No upcoming appointments."/><Link href="/staff/calendar" className="mt-5 inline-block text-sm font-semibold text-accent-dark underline underline-offset-4">See full schedule</Link></Card></div>
  </div></>;
}

export async function StaffCalendar() {
  const data = await readStaffWorkspace();
  const formatDay = new Intl.DateTimeFormat("en", { timeZone: data.timezone, weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const groups = new Map<string, StaffAppointment[]>();
  for (const appointment of data.upcoming) {
    const day = formatDay.format(new Date(appointment.starts_at));
    groups.set(day, [...(groups.get(day) ?? []), appointment]);
  }
  return <><PageHeading title="Your schedule" description={`Upcoming assigned appointments · ${data.timezone}. Pending requests are listed separately because they do not hold a slot.`}><Link href="/staff/appointments" className="button-secondary">View requests</Link></PageHeading>
    {groups.size ? <div className="space-y-5">{[...groups].map(([day, appointments]) => <section key={day} className="surface-card overflow-hidden"><h2 className="border-b border-line bg-canvas/60 px-5 py-4 text-lg font-semibold sm:px-7">{day}</h2><ol className="divide-y divide-line">{appointments.map(appointment => <li key={appointment.id} className="grid gap-3 px-5 py-5 sm:grid-cols-[minmax(130px,.35fr)_minmax(0,1fr)_auto] sm:items-center sm:px-7"><p className="text-sm font-semibold text-accent-dark"><Time value={appointment.starts_at} zone={data.timezone}/></p><div><p className="font-semibold">{appointment.customer_name}</p><p className="mt-1 text-sm text-muted">{appointment.service_name}</p></div><Status value={appointment.state}/></li>)}</ol></section>)}</div> : <Card title="Upcoming schedule"><Empty>No appointments are scheduled yet.</Empty></Card>}
    <p className="mt-5 text-sm text-muted">Showing up to 100 upcoming assigned appointments.</p>
  </>;
}

export async function StaffAppointmentsPage({ focusId }: { focusId?: string } = {}) {
  const data = await readStaffWorkspace();
  return <><PageHeading title="Appointments" description={`Your assigned requests and scheduled visits · ${data.timezone}.`}/><div className="space-y-6">
    {data.approval_mode === "STAFF_APPROVAL" ? <RequestQueue data={data} focusId={focusId}/> : <Card title="Pending requests"><p className="mb-4 text-sm text-muted">The business approval policy determines who can review requests.</p><Appointments rows={data.pending} zone={data.timezone} empty="No pending requests assigned to you." anchors focusId={focusId}/></Card>}
    <Card title="Upcoming bookings"><Appointments rows={data.upcoming} zone={data.timezone} empty="No upcoming appointments assigned to you." anchors focusId={focusId}/></Card>
    <Card title="Today’s full list"><Appointments rows={data.today} zone={data.timezone} empty="No appointments assigned to you today." focusId={focusId}/></Card>
  </div></>;
}

export async function StaffAvailability() {
  const data = await readStaffWorkspace();
  return <><PageHeading title="Your availability" description={`Hours use ${data.timezone}. An owner or administrator can change your schedule.`}/><div className="space-y-6"><Card title="Regular hours"><Schedule data={data}/><p className="mt-4 text-sm leading-6 text-muted">Available booking time is the overlap of your working hours and business hours, excluding closures, exceptions and reservations.</p></Card><Card title="Upcoming changes">{!data.exceptions.length ? <Empty>No breaks, leave or extra hours are scheduled.</Empty> : <Table headers={["Type / reason", "Start", "End"]}>{data.exceptions.map(exception => <tr key={exception.id}><td className="font-medium">{exception.kind.replaceAll("_", " ")}<p className="mt-1 text-xs font-normal text-muted">{exception.reason}</p></td><td><Time value={exception.starts_at} zone={data.timezone}/></td><td><Time value={exception.ends_at} zone={data.timezone}/></td></tr>)}</Table>}</Card></div></>;
}
