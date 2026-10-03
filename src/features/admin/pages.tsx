import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { readAdmin, type SearchParams } from "./data.server";
import { appointmentStates } from "./schemas";
import { label,money,shiftDate } from "./format";
import { SettingsForm, ApprovalModeForm, HoursForm, ClosureForm, AnnouncementForm, DeleteForm, Form } from "./forms";
import { PageHeading, Card, Empty, Status, Table, Time, AppointmentTable, PaymentsTable, Pagination, inputClass, buttonClass } from "./ui";
import type { AdminData } from "./types";
import type { Appointment } from "./types";
import { acceptAsAdmin, declineAsAdmin, advanceAsAdmin } from "@/features/appointments/actions";

const zoneOf=(data:AdminData)=>data.business?.timezone??"UTC";
function noShowWindowReached(start:string, graceMinutes:number){ return Date.now() >= Date.parse(start)+graceMinutes*60000; }
function Filters({values,appointments=false}:{values:{q:string;status:string;date:string};appointments?:boolean}) {
  return <form className="mb-6 grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-medium">Search<input name="q" maxLength={100} defaultValue={values.q} placeholder={appointments?"Customer, service, staff or ID":"Name, email or phone"} className={`${inputClass} mt-1.5`}/></label>{appointments&&<><label className="text-sm font-medium">Status<select name="status" defaultValue={values.status} className={`${inputClass} mt-1.5`}><option value="">All statuses</option>{appointmentStates.map(s=><option key={s} value={s}>{label(s)}</option>)}</select></label><label className="text-sm font-medium">Appointment date<input name="date" type="date" defaultValue={values.date} className={`${inputClass} mt-1.5`}/></label></>}<div className="flex items-center gap-4"><button className={buttonClass}>Apply filters</button><Link href={appointments?"/admin/appointments":"/admin/customers"} className="text-sm text-accent-dark">Clear</Link></div></form>;
}
function PendingQueue({rows,zone}:{rows:Appointment[];zone:string}) {
  if(!rows.length)return <Empty>No pending requests.</Empty>;
  return <Table headers={["Customer / service","Assigned staff / time","Payment / submitted","Actions"]}>{rows.map(a=><tr key={a.id}>
    <td><p className="font-medium">{a.customer_name}</p><p className="mt-1 text-xs text-muted">{a.service_name} · {Math.round((Date.parse(a.ends_at)-Date.parse(a.starts_at))/60000)} minutes</p></td>
    <td>{a.staff_name}<p className="mt-1 text-xs text-muted"><Time value={a.starts_at} zone={zone}/></p></td>
    <td>{a.payment_mode_snapshot==="PAY_AT_BUSINESS"?"Pay at the business":`${label(a.payment_mode_snapshot)} · ${money(a.required_payment_amount,a.currency)} due after acceptance`}<p className="mt-1 text-xs text-muted">Submitted <Time value={a.created_at} zone={zone}/></p></td>
    <td><div className="min-w-48 space-y-3"><Form action={acceptAsAdmin} hidden={{appointmentId:a.id}} fields={[]} submit="Accept"/><Form action={declineAsAdmin} hidden={{appointmentId:a.id}} fields={[{name:"reason",label:"Reason for declining",type:"textarea",required:true,maxLength:1000}]} submit="Decline"/><Link className="inline-block text-sm text-accent-dark underline" href={`/admin/appointments/${a.id}`}>View details</Link></div></td>
  </tr>)}</Table>;
}
export async function DashboardPage() {
  const {data}=await readAdmin("dashboard"); const zone=zoneOf(data), s=data.stats!;
  const collected=data.money?.length?data.money.map(m=>money(m.today_collected,m.currency)).join(" · "):"—";
  const cards: [string,React.ReactNode,string,string][]=[
    ["Appointments today",s.today,"Scheduled for today","bg-info-soft text-info"],
    ["Requests to review",s.pending,"Need a decision","bg-warning-soft text-warning"],
    ["Upcoming reservations",s.upcoming,"On the calendar","bg-accent-soft text-accent-dark"],
    ["Collected today",collected,"Verified payments","bg-success-soft text-success"],
  ];
  return <><PageHeading title={data.business?`${data.business.name} overview`:"Business overview"} description={`${data.date} · ${zone}. Your team’s schedule, customer requests and business activity.`}><Link href="/admin/settings" className="button-secondary min-h-11">Business settings</Link></PageHeading>
  {!data.business&&<p className="mb-6 rounded-lg border border-warning/30 bg-warning-soft p-4 text-sm">Start by configuring your business information, booking policy and weekly hours.</p>}
  <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([title,value,detail,tone])=><section key={title} className="surface-card min-w-0 p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><h2 className="text-sm font-semibold text-muted">{title}</h2><span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center rounded-xl ${tone}`}><svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 18V6m0 12h16M8 14l3-3 3 2 5-6"/></svg></span></div><div className="mt-3 break-words text-3xl font-semibold tracking-tight text-ink sm:text-[2rem]">{value}</div><p className="mt-1.5 text-xs text-muted">{detail}</p></section>)}</div>
  <div className="mb-7 flex flex-wrap gap-x-6 gap-y-3 rounded-2xl border border-line bg-white px-5 py-4 text-sm text-muted"><span><strong className="text-ink">{s.confirmed}</strong> confirmed today</span><span><strong className="text-ink">{s.payment_expired}</strong> expired payment windows</span><span><strong className="text-ink">{s.completed}</strong> completed</span><span><strong className="text-ink">{s.no_show}</strong> no-shows</span></div>
  <div className="grid gap-6 xl:grid-cols-2"><div className="xl:col-span-2"><Card title="Pending booking requests"><p className="mb-4 text-sm text-muted">Requests do not reserve a slot. Required payments can only follow staff acceptance.</p><AppointmentTable rows={data.pending??[]} zone={zone} emptyMessage="No requests need review right now."/><Link href="/admin/appointments?status=PENDING" className="mt-4 inline-block text-sm font-semibold text-accent-dark">View all pending requests</Link></Card></div>
  <Card title="Today's schedule"><AppointmentTable rows={[...(data.schedule??[])].sort((a,b)=>a.starts_at.localeCompare(b.starts_at))} zone={zone} emptyMessage="No appointments scheduled for today."/><Link href={`/admin/calendar?date=${data.date}`} className="mt-4 inline-block text-sm font-semibold text-accent-dark">View the full day</Link></Card>
  <Card title="Upcoming appointments"><AppointmentTable rows={data.upcoming??[]} zone={zone} emptyMessage="No upcoming reservations yet."/><p className="mt-3 text-xs text-muted">Next 10 accepted reservations. Awaiting-payment reservations still need verified payment.</p></Card>
  <div className="xl:col-span-2"><Card title="Recent activity">{data.activity?.length?<ul className="divide-y divide-line">{data.activity.map(a=><li key={a.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span className="capitalize">{label(a.action)} · {label(a.entity_table)}</span><span className="text-xs text-muted"><Time value={a.created_at} zone={zone}/></span></li>)}</ul>:<Empty>No business activity recorded yet.</Empty>}</Card></div></div></>;
}
export async function SettingsPage() {
  const {data}=await readAdmin("settings");
  const approvalLabel={ADMIN_APPROVAL:"Owner or administrator review",STAFF_APPROVAL:"Assigned staff review",AUTO_CONFIRM:"Automatic confirmation"} as const;
  const mode=data.business?.booking_approval_mode??"ADMIN_APPROVAL";
  return <><PageHeading title="Business settings" description="Configure this business and the rules used for new booking requests."/><div className="space-y-6"><Card title="Business information and booking rules"><SettingsForm data={data}/></Card><Card title="Booking approval"><p className="mb-3 text-sm font-medium">Current mode: {approvalLabel[mode as keyof typeof approvalLabel]??"Owner or administrator review"}</p><ApprovalModeForm mode={mode}/><p className="mt-3 text-sm leading-6 text-muted">Pending requests do not reserve a time. Automatic confirmation reserves a free time immediately. Payment requirements come from the price snapshot for each request.</p></Card><Card title={data.business?`Weekly business hours · ${zoneOf(data)}`:"Weekly business hours"}>{!data.business&&<p className="mb-4 text-sm text-muted">Save your business timezone above before configuring hours.</p>}<HoursForm rows={data.hours??[]}/></Card><Link href="/admin/closures" className="inline-block text-sm font-medium text-accent-dark">Manage business closures and special dates →</Link></div></>;
}
export async function ClosuresPage({search}:{search:SearchParams}) {
  const {data}=await readAdmin("closures",search); const zone=zoneOf(data);
  return <><PageHeading title="Business closures" description={`Full-day or partial closures in ${zone}. Changes cannot invalidate active reservations.`}/><div className="space-y-6"><Card title="Create a closure"><ClosureForm/></Card><Card title="Scheduled closures">{data.closures?.length?<div className="space-y-4">{data.closures.map(c=><article key={c.id} className="rounded-lg border border-line p-4"><h3 className="font-medium">{c.public_reason}</h3><p className="mt-2 text-sm text-muted"><Time value={c.starts_at} zone={zone}/> — <Time value={c.ends_at} zone={zone}/></p><DeleteForm kind="closure" id={c.id}/></article>)}</div>:<Empty>No closures scheduled.</Empty>}<Pagination path="/admin/closures" page={data.page} total={data.total??0}/></Card></div></>;
}
export async function AnnouncementsPage({search}:{search:SearchParams}) {
  const {data}=await readAdmin("announcements",search); const zone=zoneOf(data);
  return <><PageHeading title="Announcements" description="Create and schedule business updates. Unpublish an update to keep it as a draft."/><div className="space-y-6"><Card title="New announcement"><AnnouncementForm zone={zone}/></Card><Card title="Saved announcements">{data.announcements?.length?<div className="space-y-4">{data.announcements.map(a=><details key={a.id} className="rounded-lg border border-line p-4"><summary className="cursor-pointer text-sm font-semibold">{a.title}<span className="ml-3 text-xs font-normal text-muted">{a.published?"Published (display schedule applies)":"Draft"}</span></summary><p className="my-4 whitespace-pre-wrap text-sm text-muted">{a.body}</p><AnnouncementForm row={a} zone={zone}/><DeleteForm kind="announcement" id={a.id}/></details>)}</div>:<Empty>No announcements created yet.</Empty>}<Pagination path="/admin/announcements" page={data.page} total={data.total??0}/></Card></div></>;
}
export async function AppointmentsPage({search}:{search:SearchParams}) {
  const {data,filters}=await readAdmin("appointments",search);
  const pending=filters.status==="PENDING"?data:(await readAdmin("appointments",{status:"PENDING"})).data;
  return <><PageHeading title="Appointments" description={`Review booking requests and appointment records. Dates are in ${zoneOf(data)}.`}/><Card title="Pending request queue"><p className="mb-4 text-sm text-muted">These requests do not reserve a time. Accepting rechecks the current schedule and acquires the slot.</p><PendingQueue rows={pending.appointments??[]} zone={zoneOf(data)}/><Link href="/admin/appointments?status=PENDING" className="mt-4 inline-block text-sm font-medium text-accent-dark underline">View pending requests with pagination</Link></Card><div className="mt-7"><Filters values={filters} appointments/><AppointmentTable rows={data.appointments??[]} zone={zoneOf(data)}/><Pagination path="/admin/appointments" page={data.page} total={data.total??0} query={{q:filters.q,status:filters.status,date:filters.date}}/></div></>;
}
export async function CalendarPage({search}:{search:SearchParams}) {
  const {data}=await readAdmin("calendar",search);
  const date=data.date;
  return <><PageHeading title="Calendar" description={`Daily schedule · ${zoneOf(data)}. Pending requests and expired payment windows do not reserve or block a time.`}/><div className="mb-6 flex flex-wrap items-end gap-4"><Link href={`/admin/calendar?date=${shiftDate(date,-1)}`} className="py-2 text-sm text-accent-dark">← Previous day</Link><form className="flex flex-wrap items-end gap-3"><label className="text-sm font-medium">Date<input name="date" type="date" defaultValue={date} required className={`${inputClass} mt-1.5`}/></label><button className={buttonClass}>Go</button></form><Link href={`/admin/calendar?date=${shiftDate(date,1)}`} className="py-2 text-sm text-accent-dark">Next day →</Link><Link href="/admin/calendar" className="py-2 text-sm text-accent-dark">Today</Link></div><Card title={date}><AppointmentTable rows={data.appointments??[]} zone={zoneOf(data)}/><Pagination path="/admin/calendar" page={data.page} total={data.total??0} query={{date}}/></Card></>;
}
export async function AppointmentPage({id}:{id:string}) {
  // readAdmin always authorizes before loading any record, including details.
  const {data,supabase}=await readAdmin("appointment",{},z.uuid().safeParse(id).success?id:"00000000-0000-0000-0000-000000000000");
  const a=data.appointments?.[0]; if (!a) notFound(); const zone=zoneOf(data);
  const [contactResult,notesResult,policyResult]=await Promise.all([
    supabase.from("customers").select("email,phone").eq("id",a.customer_id).maybeSingle(),
    supabase.from("appointment_notes").select("id,body,visibility,created_at").eq("appointment_id",a.id).order("created_at",{ascending:true}),
    supabase.from("booking_policy_versions").select("no_show_grace_minutes").eq("id",a.policy_version_id).maybeSingle(),
  ]);
  if(contactResult.error||notesResult.error||policyResult.error)throw new Error("Appointment details could not be loaded.");
  const canNoShow=a.state==="CONFIRMED"&&noShowWindowReached(a.starts_at,policyResult.data?.no_show_grace_minutes??15);
  const paid=BigInt(a.collected_amount??"0"), total=BigInt(a.total_amount);
  const paymentLabel=paid===0n?"No verified collection":paid<total?"Partially collected":"Collected in full";
  return <><PageHeading title="Appointment details" description={`Reference ${a.public_reference}`}><Link href="/admin/appointments" className="text-sm text-accent-dark">Back to appointments</Link></PageHeading><div className="space-y-6">{a.state==="PAYMENT_EXPIRED"&&<Card title="Payment window expired"><p className="text-sm leading-6">The payment deadline passed without a verified on-time payment. This reservation no longer holds the time. The record is read-only; a new appointment must use the normal booking flow.</p></Card>}<Card title={a.service_name??"Service snapshot"}><dl className="grid gap-5 text-sm sm:grid-cols-2">{[
    ["Customer",<Link key="customer" className="text-accent-dark underline" href={`/admin/customers/${a.customer_id}`}>{a.customer_name}</Link>],
    ["Email",contactResult.data?.email??"—"],["Phone",contactResult.data?.phone??"—"],
    ["Assigned staff",a.staff_name],["Starts",<Time key="start" value={a.starts_at} zone={zone}/>],["Ends",<Time key="end" value={a.ends_at} zone={zone}/>],
    ["Duration",`${Math.round((Date.parse(a.ends_at)-Date.parse(a.starts_at))/60000)} minutes`],["Submitted",<Time key="submitted" value={a.created_at} zone={zone}/>],
    ["Price snapshot",money(a.total_amount,a.currency)],["Payment requirement",label(a.payment_mode_snapshot)],["Required upfront amount",money(a.required_payment_amount,a.currency)],
    ["Appointment status",<Status key="state" value={a.state}/>],["Collection status",paymentLabel],["Verified collection",money(a.collected_amount??"0",a.currency)],
    ["Payment deadline",<Time key="due" value={a.payment_due_at} zone={zone}/>],["Payment expired",<Time key="expired" value={a.payment_expired_at} zone={zone}/>],["Cancellation / decline reason",a.cancellation_reason??a.decline_reason??"—"],
  ].map(([title,value],i)=><div key={i}><dt className="mb-1 text-xs font-medium text-muted">{title}</dt><dd className="break-words">{value}</dd></div>)}</dl></Card>
  {a.state==="PENDING"&&<Card title="Review this request"><div className="grid gap-5 sm:grid-cols-2"><Form action={acceptAsAdmin} hidden={{appointmentId:a.id}} fields={[]} submit="Accept and reserve time"/><Form action={declineAsAdmin} hidden={{appointmentId:a.id}} fields={[{name:"reason",label:"Reason for declining",type:"textarea",required:true,maxLength:1000}]} submit="Decline request"/></div></Card>}
  {a.state==="CONFIRMED"&&<Card title="Operational actions"><div className="grid gap-5 sm:grid-cols-2"><Form action={advanceAsAdmin} hidden={{appointmentId:a.id,target:"CHECKED_IN"}} fields={[]} submit="Check in"/>{canNoShow&&<Form action={advanceAsAdmin} hidden={{appointmentId:a.id,target:"NO_SHOW"}} fields={[]} submit="Mark no-show"/>}<Form action={advanceAsAdmin} hidden={{appointmentId:a.id,target:"CANCELLED"}} fields={[{name:"reason",label:"Cancellation reason",type:"textarea",required:true,maxLength:1000}]} submit="Cancel appointment"/></div></Card>}
  {a.state==="CHECKED_IN"&&<Card title="Operational actions"><Form action={advanceAsAdmin} hidden={{appointmentId:a.id,target:"IN_PROGRESS"}} fields={[]} submit="Start service"/></Card>}
  {a.state==="IN_PROGRESS"&&<Card title="Operational actions"><Form action={advanceAsAdmin} hidden={{appointmentId:a.id,target:"COMPLETED"}} fields={[]} submit="Mark completed"/></Card>}
  <Card title="Booking notes">{notesResult.data?.length?<ul className="space-y-3">{notesResult.data.map(n=><li key={n.id} className="rounded-lg border border-line p-3"><p className="text-xs text-muted">{label(n.visibility)} · <Time value={n.created_at} zone={zone}/></p><p className="mt-2 whitespace-pre-wrap text-sm">{n.body}</p></li>)}</ul>:<Empty>No booking notes recorded.</Empty>}</Card>
  <Card title="Payment records"><PaymentsTable rows={data.payments??[]} zone={zone}/><p className="mt-3 text-xs text-muted">Collection totals are gross receipts. Refunds are tracked separately in Payments.</p></Card>
  <Card title="Appointment history">{data.events?.length?<ol className="space-y-4 border-l-2 border-line pl-5">{data.events.map(e=><li key={e.id}><p className="text-sm capitalize">{e.from_state?`${label(e.from_state)} → `:"Requested → "}<Status value={e.to_state}/></p><p className="mt-1 text-xs text-muted"><Time value={e.created_at} zone={zone}/></p>{e.reason&&<p className="mt-2 whitespace-pre-wrap text-sm">{e.reason}</p>}</li>)}</ol>:<Empty>No transition events recorded.</Empty>}</Card></div></>;
}
export async function CustomersPage({search}:{search:SearchParams}) {
  const {data,filters}=await readAdmin("customers",search); const zone=zoneOf(data);
  return <><PageHeading title="Customers" description="Registered and guest customer records visible to authorized business administrators."/><Filters values={filters}/>{data.customers?.length?<Table headers={["Customer","Contact","Appointments","Last appointment","Upcoming reservation"]}>{data.customers.map(c=><tr key={c.id}><td><Link className="font-medium text-accent-dark underline" href={`/admin/customers/${c.id}`}>{c.display_name}</Link></td><td><p>{c.email??"—"}</p><p className="mt-1 text-xs text-muted">{c.phone??"—"}</p></td><td>{c.appointment_count}</td><td><Time value={c.last_appointment} zone={zone}/></td><td><Time value={c.next_appointment} zone={zone}/></td></tr>)}</Table>:<Empty>No customers match this search.</Empty>}<Pagination path="/admin/customers" page={data.page} total={data.total??0} query={{q:filters.q}}/></>;
}
export async function CustomerPage({id,search}:{id:string;search:SearchParams}) {
  const {data}=await readAdmin("customer",search,z.uuid().safeParse(id).success?id:"00000000-0000-0000-0000-000000000000");
  const c=data.customer;if(!c)notFound();const zone=zoneOf(data);
  return <><PageHeading title={c.display_name} description="Customer details and appointment history"><Link href="/admin/customers" className="text-sm text-accent-dark">Back to customers</Link></PageHeading><div className="space-y-6">
    <Card title="Customer information"><dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-muted">Email</dt><dd className="break-words">{c.email??"—"}</dd></div><div><dt className="text-muted">Phone</dt><dd>{c.phone??"—"}</dd></div><div><dt className="text-muted">Next reservation</dt><dd><Time value={data.next_appointment} zone={zone}/></dd></div><div><dt className="text-muted">No-shows</dt><dd>{data.no_shows??0}</dd></div></dl></Card>
    <Card title="Upcoming appointments"><AppointmentTable rows={data.upcoming??[]} zone={zone}/><p className="mt-3 text-xs text-muted">Next 10 accepted reservations. All appointments are included in the paginated history below.</p></Card>
    <Card title="Appointments"><div className="mb-4 flex gap-4 text-sm"><Link href={`/admin/customers/${id}`} className="text-accent-dark">All history</Link><Link href={`/admin/customers/${id}?status=NO_SHOW`} className="text-accent-dark">No-show history</Link></div><AppointmentTable rows={data.appointments??[]} zone={zone}/><Pagination path={`/admin/customers/${id}`} page={data.page} total={data.total??0} query={{status:typeof search.status==="string"?search.status:""}}/></Card>
  </div></>;
}
export async function PaymentsPage({search}:{search:SearchParams}) {
  const {data}=await readAdmin("payments",search);
  return <><PageHeading title="Payments" description="Actual payment attempts, verified collections and refund states."/><PaymentsTable rows={data.payments??[]} zone={zoneOf(data)}/><Pagination path="/admin/payments" page={data.page} total={data.total??0}/></>;
}
export async function ReportsPage() {
  const {data}=await readAdmin("reports");
  return <><PageHeading title="Reports" description="Lifetime operational totals, grouped by currency. These reports use stored appointment and verified payment records."/><div className="space-y-6"><Card title="Appointments by current status">{data.by_status?.length?<Table headers={["Status","Appointments"]}>{data.by_status.map(s=><tr key={s.state}><td><Status value={s.state}/></td><td>{s.count}</td></tr>)}</Table>:<Empty>0 appointments recorded.</Empty>}</Card><Card title="Collections and balances">{data.money?.length?<Table headers={["Currency","Gross collected","Successful refunds","Net collected","Outstanding"]}>{data.money.map(m=><tr key={m.currency}><td>{m.currency}</td><td>{money(m.collected,m.currency)}</td><td>{money(m.refunded,m.currency)}</td><td>{money((BigInt(m.collected)-BigInt(m.refunded)).toString(),m.currency)}</td><td>{money(m.outstanding,m.currency)}</td></tr>)}</Table>:<Empty>0 collections, refunds and outstanding balances.</Empty>}<p className="mt-4 text-xs leading-6 text-muted">Collections include deposits and verified late payments; they are cash receipts, not earned service revenue. Refund totals include only successful refunds. Outstanding is the unpaid appointment price for accepted, active, completed and no-show appointments, before refunds. Pending, declined, expired and cancelled requests are excluded; refunds do not automatically create a new debt.</p></Card></div></>;
}
