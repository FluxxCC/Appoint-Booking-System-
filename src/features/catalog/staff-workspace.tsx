import Link from "next/link";
import { readStaffWorkspace } from "./data.server";
import { Card, PageHeading, Empty, Table, Time, Status } from "@/features/admin/ui";
import type { StaffAppointment, StaffWorkspace } from "./types";
import { Form } from "@/features/admin/forms";
import { acceptAsStaff, declineAsStaff } from "@/features/appointments/actions";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function Schedule({ data, today = false }: { data: StaffWorkspace; today?: boolean }) {
  const weekday = new Date(`${data.date}T12:00:00Z`).getUTCDay();
  return <Table headers={["Day", "Your hours", "Business hours"]}>{days.map((day, index) => (!today || index === weekday) && <tr key={day}>
    <td className="font-medium">{day}</td>
    <td>{data.hours.filter(hour => hour.weekday === index).map(hour => `${hour.starts_at.slice(0, 5)}–${hour.ends_at.slice(0, 5)}`).join(", ") || "Off"}</td>
    <td>{data.business_hours.filter(hour => hour.weekday === index).map(hour => `${hour.opens_at.slice(0, 5)}–${hour.closes_at.slice(0, 5)}`).join(", ") || "Closed"}</td>
  </tr>)}</Table>;
}

function Appointments({ rows, zone, empty = "No appointments in this view." }: { rows: StaffAppointment[]; zone: string; empty?: string }) {
  return !rows.length ? <Empty>{empty}</Empty> : <Table headers={["Customer / service", "Start / end", "Status"]}>{rows.map(appointment => <tr key={appointment.id}>
    <td><span className="font-semibold">{appointment.customer_name}</span><p className="mt-1 text-xs text-muted">{appointment.service_name}</p></td>
    <td><Time value={appointment.starts_at} zone={zone}/><p className="mt-1 text-xs text-muted">Until <Time value={appointment.ends_at} zone={zone}/></p></td>
    <td><Status value={appointment.state}/></td>
  </tr>)}</Table>;
}

function RequestQueue({ data }: { data: StaffWorkspace }) {
  return <Card title="Your pending requests">
    <p className="mb-5 max-w-2xl text-sm leading-6 text-muted">A request does not reserve a time. Accepting it checks availability again and reserves the slot when successful.</p>
    {data.pending.length ? <div className="space-y-3">{data.pending.map(appointment => <article key={appointment.id} className="rounded-2xl border border-line bg-canvas/50 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{appointment.customer_name}</h3><p className="mt-1 text-sm text-muted">{appointment.service_name} · <Time value={appointment.starts_at} zone={data.timezone}/></p></div><Status value={appointment.state}/></div>
      <div className="mt-5 grid gap-5 border-t border-line pt-5 sm:grid-cols-2"><Form action={acceptAsStaff} hidden={{ appointmentId: appointment.id }} fields={[]} submit="Accept request"/><Form action={declineAsStaff} hidden={{ appointmentId: appointment.id }} fields={[{ name: "reason", label: "Reason for declining", type: "textarea", required: true, maxLength: 1000 }]} submit="Decline request"/></div>
    </article>)}</div> : <Empty>No requests assigned to you.</Empty>}
  </Card>;
}

export async function StaffDashboard() {
  const data = await readStaffWorkspace();
  const next = data.upcoming.find(appointment => appointment.starts_at >= new Date().toISOString());
  return <><PageHeading title="Your day" description={`Your appointments and working hours for ${data.date} · ${data.timezone}.`}><Link href="/staff/calendar" className="button-secondary">View schedule</Link></PageHeading>
  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(270px,1fr)]">
    <section className="rounded-[1.25rem] bg-ink p-6 text-white sm:p-8"><p className="text-xs font-bold uppercase tracking-[.16em] text-on-dark-accent">Next booked appointment</p>{next ? <><h2 className="mt-5 display-type text-3xl sm:text-4xl">{next.customer_name}</h2><p className="mt-2 text-white/75">{next.service_name}</p><p className="mt-6 text-lg font-semibold"><Time value={next.starts_at} zone={data.timezone}/></p><div className="mt-4"><Status value={next.state}/></div></> : <><h2 className="mt-5 display-type text-3xl">You’re all caught up.</h2><p className="mt-3 max-w-md text-sm leading-6 text-white/75">Your next confirmed appointment will appear here when one is scheduled.</p></>}</section>
    <div className="grid grid-cols-2 gap-3">{[["Today", data.stats.today], ["Requests", data.stats.pending], ["Confirmed", data.stats.confirmed], ["Coming up", data.stats.upcoming]].map(([label, value]) => <section key={label} className="surface-card flex flex-col justify-between p-5"><p className="text-sm font-medium text-muted">{label}</p><p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p></section>)}</div>
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

export async function StaffAppointmentsPage() {
  const data = await readStaffWorkspace();
  return <><PageHeading title="Appointments" description={`Your assigned requests and scheduled visits · ${data.timezone}.`}/><div className="space-y-6">
    {data.approval_mode === "STAFF_APPROVAL" ? <RequestQueue data={data}/> : <Card title="Pending requests"><p className="mb-4 text-sm text-muted">The business approval policy determines who can review requests.</p><Appointments rows={data.pending} zone={data.timezone} empty="No pending requests assigned to you."/></Card>}
    <Card title="Upcoming bookings"><Appointments rows={data.upcoming} zone={data.timezone} empty="No upcoming appointments assigned to you."/></Card>
    <Card title="Today’s full list"><Appointments rows={data.today} zone={data.timezone} empty="No appointments assigned to you today."/></Card>
  </div></>;
}

export async function StaffAvailability() {
  const data = await readStaffWorkspace();
  return <><PageHeading title="Your availability" description={`Hours use ${data.timezone}. An owner or administrator can change your schedule.`}/><div className="space-y-6"><Card title="Regular hours"><Schedule data={data}/><p className="mt-4 text-sm leading-6 text-muted">Available booking time is the overlap of your working hours and business hours, excluding closures, exceptions and reservations.</p></Card><Card title="Upcoming changes">{!data.exceptions.length ? <Empty>No breaks, leave or extra hours are scheduled.</Empty> : <Table headers={["Type / reason", "Start", "End"]}>{data.exceptions.map(exception => <tr key={exception.id}><td className="font-medium">{exception.kind.replaceAll("_", " ")}<p className="mt-1 text-xs font-normal text-muted">{exception.reason}</p></td><td><Time value={exception.starts_at} zone={data.timezone}/></td><td><Time value={exception.ends_at} zone={data.timezone}/></td></tr>)}</Table>}</Card></div></>;
}
