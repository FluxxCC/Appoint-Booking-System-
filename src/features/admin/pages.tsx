import Link from "next/link";
import { BackButton } from "@/components/ui/back-button";
import { notFound } from "next/navigation";
import { z } from "zod";
import { readAdmin, readCustomerDirectory, readHomeServiceStatus, type SearchParams } from "./data.server";
import { appointmentStates } from "./schemas";
import { label,money } from "./format";
import { SettingsForm, ApprovalModeForm, HoursForm, ClosureForm, AnnouncementForm, DeleteForm, Form } from "./forms";
import { PageHeading, Card, Empty, Status, Table, Time, AppointmentTable, PaymentsTable, Pagination, inputClass, buttonClass } from "./ui";
import type { AdminData } from "./types";
import type { Appointment } from "./types";
import { acceptAsAdmin, declineAsAdmin, advanceAsAdmin } from "@/features/appointments/actions";
import { ReviewActions } from "./review-actions";
import {directionsUrl} from "@/lib/maps";
import LocationMap from "@/features/public-site/location-map";
import { FinancialMetricsPage } from "./financial-metrics";

const zoneOf=(data:AdminData)=>data.business?.timezone??"UTC";
export { CalendarPage } from "./calendar";
function noShowWindowReached(start:string, graceMinutes:number){ return Date.now() >= Date.parse(start)+graceMinutes*60000; }
function Filters({values,appointments=false}:{values:{q:string;status:string;date:string};appointments?:boolean}) {
  return <form className="mb-6 grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-medium">Search<input name="q" maxLength={100} defaultValue={values.q} placeholder={appointments?"Customer, service, staff or ID":"Name, email or phone"} className={`${inputClass} mt-1.5`}/></label>{appointments&&<><label className="text-sm font-medium">Status<select name="status" defaultValue={values.status} className={`${inputClass} mt-1.5`}><option value="">All statuses</option>{appointmentStates.map(s=><option key={s} value={s}>{label(s)}</option>)}</select></label><label className="text-sm font-medium">Appointment date<input name="date" type="date" defaultValue={values.date} className={`${inputClass} mt-1.5`}/></label></>}<div className="flex items-center gap-4"><button className={buttonClass}>Apply filters</button><Link href={appointments?"/admin/appointments":"/admin/customers"} className="text-sm text-accent-dark">Clear</Link></div></form>;
}
function sortClosures<T extends { starts_at: string; ends_at: string }>(rows: T[]) {
  const now = Date.now();
  return [...rows].sort((a,b)=>{
    const aStart=Date.parse(a.starts_at),aEnd=Date.parse(a.ends_at),bStart=Date.parse(b.starts_at),bEnd=Date.parse(b.ends_at);
    const aGroup=aEnd<=now?2:aStart<=now?0:1,bGroup=bEnd<=now?2:bStart<=now?0:1;
    if(aGroup!==bGroup)return aGroup-bGroup;
    return aGroup===2?bStart-aStart:aStart-bStart;
  });
}
function closureStatus(startsAt: string, endsAt: string) {
  const now = Date.now();
  const starts = Date.parse(startsAt), ends = Date.parse(endsAt);
  return ends <= now ? "Past" : starts <= now ? "In progress" : "Upcoming";
}
function PendingQueue({rows,zone}:{rows:Appointment[];zone:string}) {
  if(!rows.length)return <Empty>No requests are waiting for review.</Empty>;
  return <div className="space-y-4">{rows.map(a=><article key={a.id} className="rounded-2xl border border-line bg-white p-5 shadow-[0_8px_24px_-22px_#49341f90] sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold tracking-tight text-ink">{a.customer_name}</h3><p className="mt-1 text-sm text-muted">{a.service_name} · {Math.round((Date.parse(a.ends_at)-Date.parse(a.starts_at))/60000)} minutes</p>{a.branch_name&&<p className="mt-1 text-xs font-semibold text-accent-dark">{a.branch_name}</p>}</div><Status value={a.state}/></header>
    <dl className="my-5 grid gap-4 rounded-xl bg-canvas px-4 py-4 text-sm sm:grid-cols-3"><div><dt className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Appointment</dt><dd className="font-medium"><Time value={a.starts_at} zone={zone}/></dd></div><div><dt className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Requested professional</dt><dd className="font-medium">{a.staff_name}</dd></div><div><dt className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Payment after acceptance</dt><dd className="font-medium">{a.payment_mode_snapshot==="PAY_AT_BUSINESS"?"Pay at the business":`${label(a.payment_mode_snapshot)} · ${money(a.required_payment_amount,a.currency)}`}</dd></div></dl>
 <HomeLocationCard appointment={a}/>
 {a.fulfillment_mode==="HOME_SERVICE"&&<dl className="mb-5 grid gap-3 rounded-xl border border-line p-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-xs text-muted">Service subtotal</dt><dd className="mt-1 font-semibold">{money((BigInt(a.total_amount)-BigInt(a.home_service_fee_snapshot)).toString(),a.currency)}</dd></div><div><dt className="text-xs text-muted">Home Service fee</dt><dd className="mt-1 font-semibold">{money(a.home_service_fee_snapshot,a.currency)}</dd></div><div><dt className="text-xs text-muted">Total</dt><dd className="mt-1 font-semibold">{money(a.total_amount,a.currency)}</dd></div><div><dt className="text-xs text-muted">Required payment</dt><dd className="mt-1 font-semibold">{money(a.required_payment_amount,a.currency)} · {label(a.payment_mode_snapshot)}</dd></div></dl>}
    <p className="mb-5 text-xs text-muted">Submitted <Time value={a.created_at} zone={zone}/></p>
    <div className="border-t border-line pt-5"><ReviewActions appointmentId={a.id}/></div>
  </article>)}</div>;
}
function HomeLocationCard({appointment}:{appointment:Appointment}){
 if(appointment.fulfillment_mode!=="HOME_SERVICE")return null;
 const point=appointment.home_location;
 return <div className="mb-5 rounded-xl border border-accent/20 bg-accent-soft/40 p-4 text-sm"><p className="font-semibold">Home Service · {appointment.service_area_hint??"Service area"}</p>{point&&<><p className="mt-2">{point.address}</p>{point.landmark&&<p className="mt-1 text-muted">Landmark: {point.landmark}</p>}{point.instructions&&<p className="mt-1 text-muted">Instructions: {point.instructions}</p>}<div className="mt-3 overflow-hidden rounded-xl border border-line"><LocationMap point={point} interactive={false}/></div><a className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-accent px-4 font-semibold text-white" target="_blank" rel="noreferrer" href={directionsUrl(point)}>Get Directions</a></>}<p className="mt-2 text-xs text-muted">Home Service fee {money(appointment.home_service_fee_snapshot,appointment.currency)} · travel reserved {appointment.home_travel_before_snapshot} minutes before and {appointment.home_travel_after_snapshot} minutes after.</p></div>;
}
function DashboardPreview({rows,zone,empty}:{rows:Appointment[];zone:string;empty:string}) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return <ul className="divide-y divide-line">{rows.slice(0,4).map(a=><li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"><div className="min-w-0"><Link href={`/admin/appointments/${a.id}`} className="font-semibold text-ink hover:text-accent-dark hover:underline">{a.customer_name}</Link><p className="mt-1 text-sm text-muted">{a.service_name} · {a.staff_name}</p><p className="mt-1 text-xs text-muted"><Time value={a.starts_at} zone={zone}/></p>{a.branch_name&&<p className="mt-1 text-xs font-semibold text-accent-dark">{a.branch_name}</p>}</div><Status value={a.state}/></li>)}</ul>;
}
export async function DashboardPage() {
  const {data,supabase,branchContext}=await readAdmin("dashboard"); const [homeService,zone]=[await readHomeServiceStatus(supabase,branchContext.selectedBranchId),zoneOf(data)]; const s=data.stats!;
  const collected=data.money?.length?data.money.map(m=>money(m.today_collected,m.currency)).join(" · "):"—";
  const cards: [string,React.ReactNode,string,string][]=[
    ["Appointments today",s.today,"Scheduled for today","bg-info-soft text-info"],
    ["Requests to review",s.pending,"Need a decision","bg-warning-soft text-warning"],
    ["Upcoming reservations",s.upcoming,"On the calendar","bg-accent-soft text-accent-dark"],
    ["Collected today",collected,"Verified payments","bg-success-soft text-success"],
  ];
  const branchLabel=branchContext.selectedBranchName??branchContext.allLabel;
  return <><PageHeading title="Overview" description={`${data.business?.name??"Your business"} · ${branchLabel} · ${data.date} · ${zone}. Your team’s schedule and the decisions that need attention.`}><div className="flex flex-wrap gap-2"><Link href="/admin/appointments" className="button-primary min-h-11">Appointments</Link><Link href="/admin/calendar" className="button-secondary min-h-11">Calendar</Link></div></PageHeading>
  {!data.business&&<p className="mb-6 rounded-lg border border-warning/30 bg-warning-soft p-4 text-sm">Start by configuring your business information, booking policy and weekly hours.</p>}
  <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([title,value,detail,tone],index)=><section key={title} className={`min-w-0 overflow-hidden rounded-[1.4rem] p-5 ${index===0 ? "workspace-banner relative text-white shadow-[0_18px_35px_-20px_#49341fa6]" : "surface-card"}`}><div className="relative z-10 flex items-start justify-between gap-3"><h2 className={`text-sm font-semibold ${index===0 ? "text-white/80" : "text-muted"}`}>{title}</h2><span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center rounded-xl ${index===0 ? "border border-white/20 bg-white/15 text-white" : tone}`}><svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 18V6m0 12h16M8 14l3-3 3 2 5-6"/></svg></span></div><div className={`relative z-10 mt-4 break-words text-3xl font-bold tracking-tight ${index===0 ? "text-white" : "text-ink"}`}>{value}</div><p className={`relative z-10 mt-2 text-xs ${index===0 ? "text-white/75" : "text-muted"}`}>{detail}</p></section>)}</div>
  <div className="mb-6 rounded-2xl border border-line bg-white p-5 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-5"><div><p className="eyebrow">Home Service</p><p className="mt-2 flex flex-wrap items-center gap-2 text-lg font-semibold"><span className={`rounded-full px-3 py-1 text-sm ${homeService.state==="ACTIVE"?"bg-success-soft text-success":homeService.state==="SETUP_REQUIRED"?"bg-warning-soft text-warning":"bg-canvas text-muted"}`}>{homeService.state==="ACTIVE"?"Active":homeService.state==="SETUP_REQUIRED"?"Setup required":"Disabled"}</span>{homeService.message}</p></div><Link href={homeService.href} className="button-secondary mt-4 inline-flex min-h-10 items-center px-4 sm:mt-0">{homeService.action}</Link></div>
  <div className="grid gap-6 lg:grid-cols-2"><Card title="Needs attention"><p className="mb-5 text-sm leading-6 text-muted">Review new booking requests. A request does not reserve a time until accepted.</p><DashboardPreview rows={data.pending??[]} zone={zone} empty="No requests need review right now."/><Link href="/admin/appointments?status=PENDING" className="mt-6 inline-flex text-sm font-semibold text-accent-dark hover:underline">View all requests →</Link></Card>
  <Card title="Today's schedule"><DashboardPreview rows={[...(data.schedule??[])].sort((a,b)=>a.starts_at.localeCompare(b.starts_at))} zone={zone} empty="No appointments scheduled for today."/><Link href={`/admin/calendar?date=${data.date}`} className="mt-6 inline-flex text-sm font-semibold text-accent-dark hover:underline">View the full day →</Link></Card></div>
  <details className="surface-card mt-6 p-5 sm:p-7"><summary className="cursor-pointer text-base font-semibold text-ink">Recent activity <span className="ml-2 text-xs font-normal text-muted">Expand to review</span></summary><div className="mt-5 border-t border-line pt-2">{data.activity?.length?<ul className="divide-y divide-line">{data.activity.map(a=><li key={a.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span className="capitalize">{label(a.action)} · {label(a.entity_table)}</span><span className="text-xs text-muted"><Time value={a.created_at} zone={zone}/></span></li>)}</ul>:<Empty>No business activity recorded yet.</Empty>}</div></details></>;
}
const settingsSections=[
  {id:"profile",title:"Business profile",description:"Business name, contact details, timezone and defaults."},
  {id:"booking",title:"Booking rules",description:"Approval, booking windows and customer access."},
  {id:"policies",title:"Customer policies",description:"Booking and refund policy shown to customers."},
  {id:"hours",title:"Business hours",description:"Weekly opening hours for the selected branch."},
  {id:"home-service",title:"Home Service",description:"Status, service eligibility and off-site booking setup."},
] as const;
function SettingsMenu({active}:{active?:string}) {
  return <nav aria-label="Business settings menu" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">{settingsSections.map(item=><Link key={item.id} href={item.id==="profile"?"/admin/settings/profile":`/admin/settings/${item.id}`} aria-current={active===item.id?"page":undefined} className={`rounded-xl border p-4 transition ${active===item.id?"border-accent/30 bg-accent-soft/60":"border-line bg-white hover:border-accent/30 hover:bg-canvas"}`}><span className="block text-sm font-semibold text-ink">{item.title}</span><span className="mt-1 block text-xs leading-5 text-muted">{item.description}</span></Link>)}</nav>;
}
export async function SettingsPage({section}:{section?:string}={}) {
  const {data,supabase,branchContext,principal}=await readAdmin("settings");
  const homeService=await readHomeServiceStatus(supabase,branchContext.selectedBranchId);
  const approvalLabel={ADMIN_APPROVAL:"Owner or administrator review",STAFF_APPROVAL:"Assigned staff review",AUTO_CONFIRM:"Automatic confirmation"} as const;
  const mode=data.business?.booking_approval_mode??"ADMIN_APPROVAL";
  const current=settingsSections.find(item=>item.id===section);
  const heading=current?.title??"Business settings";
  const description=current?.description??"Choose a settings area to make one focused change at a time.";
  return <><PageHeading title={heading} description={description}/>{section?<div className="grid items-start gap-6 xl:grid-cols-[240px_minmax(0,1fr)]"><SettingsMenu active={section}/><div className="min-w-0 space-y-6">{section==="profile"&&<Card title="Business profile"><SettingsForm data={data} section="profile"/></Card>}{section==="booking"&&<><Card title="Booking approval"><p className="mb-4 inline-flex flex-wrap items-center gap-2 rounded-full bg-accent-soft px-3 py-1.5 text-sm text-accent-dark"><span className="size-2 rounded-full bg-accent" aria-hidden="true"/>Current mode: <strong>{approvalLabel[mode as keyof typeof approvalLabel]??"Owner or administrator review"}</strong></p><p className="mb-4 text-sm leading-6 text-muted">Choose who reviews new requests. Pending requests do not reserve a time; automatic confirmation reserves an available time immediately.</p><ApprovalModeForm mode={mode}/><p className="mt-4 rounded-xl bg-canvas p-4 text-sm leading-6 text-muted">Payment requirements are based on the service settings saved with each booking.</p></Card><Card title="Booking limits and customer access"><SettingsForm data={data} section="booking"/></Card></>}{section==="policies"&&<Card title="Policies shown to customers"><SettingsForm data={data} section="policies"/></Card>}{section==="hours"&&<><Card title={data.business?`Weekly business hours · ${zoneOf(data)}`:"Weekly business hours"}>{branchContext.selectedBranchId?<><p className="mb-4 text-sm text-muted">These hours apply to {branchContext.selectedBranchName??"the selected branch"}. Hours use the business timezone.</p>{!data.business&&<p className="mb-4 rounded-xl bg-warning-soft p-4 text-sm leading-6 text-warning">Save your business timezone in Business profile before configuring hours.</p>}<HoursForm rows={data.hours??[]}/></>:<p className="rounded-xl bg-canvas p-4 text-sm leading-6 text-muted">Select one branch above to view and edit its weekly hours.</p>}</Card><Link href="/admin/closures" className="button-secondary inline-flex min-h-11 items-center gap-2 px-4 py-2 text-sm"><span aria-hidden="true">↗</span>Manage closures and special dates</Link></>}{section==="home-service"&&<Card title="Home Service"><div className="mb-5 flex flex-wrap items-center gap-3"><span className={`rounded-full px-3 py-1 text-sm font-semibold ${homeService.state==="ACTIVE"?"bg-success-soft text-success":homeService.state==="SETUP_REQUIRED"?"bg-warning-soft text-warning":"bg-canvas text-muted"}`}>{homeService.state==="ACTIVE"?"Active":homeService.state==="SETUP_REQUIRED"?"Setup required":"Disabled"}</span><span className="text-sm text-muted">{homeService.message}</span></div><p className="max-w-3xl text-sm leading-6 text-muted">Customers enter the visit address and map pin when booking. Authorized staff follow that confirmed destination. Manage service eligibility and travel settings in the service catalog.</p>{principal?.roles.includes("OWNER")&&<Link href="/admin/services" className="button-secondary mt-4 inline-flex min-h-11 items-center">Manage Home Service in Services</Link>}</Card>}</div></div>:<><div className="mb-6 rounded-2xl border border-line bg-white p-5 sm:p-6"><p className="text-sm font-semibold text-ink">What would you like to change?</p><p className="mt-1 text-sm leading-6 text-muted">Settings are grouped by task. Select a menu to open just those controls.</p></div><SettingsMenu/></>}</>;
}
export async function ClosuresPage({search}:{search:SearchParams}) {
  const {data,branchContext}=await readAdmin("closures",search); const zone=zoneOf(data);
  const closures=sortClosures(data.closures??[]);
  return <><PageHeading title="Closures & special dates" description={`Block new appointment times for holidays, events, or short breaks. Times use ${zone}; existing appointments are not changed.`}><Link href="/admin/settings/hours" className="button-secondary min-h-11">View business hours</Link></PageHeading>
    {!branchContext.selectedBranchId?<div className="rounded-2xl border border-warning/20 bg-warning-soft p-5 text-sm leading-6 text-warning"><p className="font-semibold">Choose a branch to manage closures</p><p className="mt-1">Closures apply to one branch. Select a branch from the workspace switcher above, then return here.</p></div>:<div className="grid items-start gap-6 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.35fr)]">
      <Card title={`Block appointment times · ${branchContext.selectedBranchName??"Selected branch"}`}><p className="mb-5 rounded-xl bg-canvas p-4 text-sm leading-6 text-muted">Use a full-day closure for holidays, or specify hours for a temporary break. The customer-facing message helps explain unavailable times.</p><ClosureForm/></Card>
      <Card title={`Scheduled closures · ${data.total??closures.length}`}>
        {closures.length?<div className="space-y-3">{closures.map(c=>{
          const starts=new Date(c.starts_at).getTime(), ends=new Date(c.ends_at).getTime();
          const status=closureStatus(c.starts_at,c.ends_at);
          const fullDay=ends-starts>=23*60*60*1000;
          const statusClass=status==="Upcoming"?"bg-accent-soft text-accent-dark":status==="In progress"?"bg-warning-soft text-warning":"bg-canvas text-muted";
          return <article key={c.id} className="rounded-xl border border-line bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink">{c.public_reason}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}>{status}</span></div><div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full border border-line px-2.5 py-1 font-medium text-muted">{fullDay?"Full day":"Specific hours"}</span></div></div>{branchContext.selectedBranchId&&<DeleteForm kind="closure" id={c.id}/>}</div>
            <dl className="mt-4 grid gap-3 border-t border-line pt-4 text-sm sm:grid-cols-2"><div><dt className="text-xs font-medium text-muted">Starts</dt><dd className="mt-1 font-medium text-ink"><Time value={c.starts_at} zone={zone}/></dd></div><div><dt className="text-xs font-medium text-muted">Ends</dt><dd className="mt-1 font-medium text-ink"><Time value={c.ends_at} zone={zone}/></dd></div></dl>
          </article>;
        })}</div>:<Empty>No closures are scheduled for this branch. Add a closure when you need to block future appointment times.</Empty>}
        <Pagination path="/admin/closures" page={data.page} total={data.total??0}/>
      </Card>
    </div>}
  </>;
}
export async function AnnouncementsPage({search}:{search:SearchParams}) {
  const {data}=await readAdmin("announcements",search); const zone=zoneOf(data);
  return <><PageHeading title="Announcements" description="Create and schedule business updates. Unpublish an update to keep it as a draft."/><div className="space-y-6"><Card title="New announcement"><AnnouncementForm zone={zone}/></Card><Card title="Saved announcements">{data.announcements?.length?<div className="space-y-4">{data.announcements.map(a=><details key={a.id} className="rounded-lg border border-line p-4"><summary className="cursor-pointer text-sm font-semibold">{a.title}<span className="ml-3 text-xs font-normal text-muted">{a.published?"Published (display schedule applies)":"Draft"}</span></summary><p className="my-4 whitespace-pre-wrap text-sm text-muted">{a.body}</p><AnnouncementForm row={a} zone={zone}/><DeleteForm kind="announcement" id={a.id}/></details>)}</div>:<Empty>No announcements created yet.</Empty>}<Pagination path="/admin/announcements" page={data.page} total={data.total??0}/></Card></div></>;
}
export async function AppointmentsPage({search}:{search:SearchParams}) {
  const {data,filters}=await readAdmin("appointments",search);
  const pending=filters.status==="PENDING"?data:(await readAdmin("appointments",{status:"PENDING"})).data;
  return <><PageHeading title="Appointments" description={`Review requests and browse appointment records. Times are shown in ${zoneOf(data)}.`}><Link href="/admin/calendar" className="button-secondary min-h-11">Open calendar</Link></PageHeading><div className="space-y-6"><Card title="Requests to review"><p className="mb-5 text-sm leading-6 text-muted">Accepting a request checks availability again and reserves the time. Payment, when required, follows acceptance.</p><PendingQueue rows={pending.appointments??[]} zone={zoneOf(data)}/><Link href="/admin/appointments?status=PENDING" className="mt-5 inline-block text-sm font-semibold text-accent-dark hover:underline">View all pending requests →</Link></Card><Card title="All appointments"><Filters values={filters} appointments/><AppointmentTable rows={data.appointments??[]} zone={zoneOf(data)}/><Pagination path="/admin/appointments" page={data.page} total={data.total??0} query={{q:filters.q,status:filters.status,date:filters.date}}/></Card></div></>;
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
  const paid=BigInt(a.collected_amount??"0"), total=BigInt(a.total_amount), balance=total>paid?total-paid:0n;
  const paymentLabel=paid===0n?"No verified collection":paid<total?"Partially collected":"Collected in full";
  return <><PageHeading title="Appointment details" description={`Reference ${a.public_reference}`}><BackButton href="/admin/appointments">Back to appointments</BackButton></PageHeading><div className="space-y-6">{a.state==="PAYMENT_EXPIRED"&&<Card title="Payment window expired"><p className="text-sm leading-6">The payment deadline passed without a verified on-time payment. This reservation no longer holds the time. The record is read-only; a new appointment must use the normal booking flow.</p></Card>}<Card title={a.service_name??"Service snapshot"}><dl className="grid gap-5 text-sm sm:grid-cols-2">{[
    ["Customer",<Link key="customer" className="text-accent-dark underline" href={`/admin/customers/${a.customer_id}`}>{a.customer_name}</Link>],
    ["Email",contactResult.data?.email??"—"],["Phone",contactResult.data?.phone??"—"],
    ["Assigned staff",a.staff_name],["Starts",<Time key="start" value={a.starts_at} zone={zone}/>],["Ends",<Time key="end" value={a.ends_at} zone={zone}/>],
    ["Duration",`${Math.round((Date.parse(a.ends_at)-Date.parse(a.starts_at))/60000)} minutes`],["Submitted",<Time key="submitted" value={a.created_at} zone={zone}/>],
    ...(a.fulfillment_mode==="HOME_SERVICE"?[["Home Service",<span key="fulfillment" className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-dark">Home Service</span>] as [string,React.ReactNode], ["Service subtotal",money((total-BigInt(a.home_service_fee_snapshot)).toString(),a.currency)] as [string,React.ReactNode], ["Home Service fee",money(a.home_service_fee_snapshot,a.currency)] as [string,React.ReactNode]]:[]),
    ["Total",money(a.total_amount,a.currency)],["Payment requirement",label(a.payment_mode_snapshot)],["Required deposit / payment",money(a.required_payment_amount,a.currency)],
    ["Appointment status",<Status key="state" value={a.state}/>],["Payment status",paymentLabel],["Amount paid",money(a.collected_amount??"0",a.currency)],["Remaining balance",money(balance.toString(),a.currency)],
    ["Payment deadline",<Time key="due" value={a.payment_due_at} zone={zone}/>],["Payment expired",<Time key="expired" value={a.payment_expired_at} zone={zone}/>],["Cancellation / decline reason",a.cancellation_reason??a.decline_reason??"—"],
  ].map(([title,value],i)=><div key={i}><dt className="mb-1 text-xs font-medium text-muted">{title}</dt><dd className="break-words">{value}</dd></div>)}</dl></Card>
  <HomeLocationCard appointment={a}/>
  {a.state==="PENDING"&&<Card title="Review this request"><div className="grid gap-5 sm:grid-cols-2"><Form action={acceptAsAdmin} hidden={{appointmentId:a.id}} fields={[]} submit="Accept and reserve time"/><Form action={declineAsAdmin} hidden={{appointmentId:a.id}} fields={[{name:"reason",label:"Reason for declining",type:"textarea",required:true,maxLength:1000}]} submit="Decline request"/></div></Card>}
  {a.state==="CONFIRMED"&&<Card title="Operational actions"><div className="grid gap-5 sm:grid-cols-2"><Form action={advanceAsAdmin} hidden={{appointmentId:a.id,target:"CHECKED_IN"}} fields={[]} submit="Check in"/>{canNoShow&&<Form action={advanceAsAdmin} hidden={{appointmentId:a.id,target:"NO_SHOW"}} fields={[]} submit="Mark no-show"/>}<Form action={advanceAsAdmin} hidden={{appointmentId:a.id,target:"CANCELLED"}} fields={[{name:"reason",label:"Cancellation reason",type:"textarea",required:true,maxLength:1000}]} submit="Cancel appointment"/></div></Card>}
  {a.state==="CHECKED_IN"&&<Card title="Operational actions"><Form action={advanceAsAdmin} hidden={{appointmentId:a.id,target:"IN_PROGRESS"}} fields={[]} submit="Start service"/></Card>}
  {a.state==="IN_PROGRESS"&&<Card title="Operational actions"><Form action={advanceAsAdmin} hidden={{appointmentId:a.id,target:"COMPLETED"}} fields={[]} submit="Mark completed"/></Card>}
  <Card title="Booking notes">{notesResult.data?.length?<ul className="space-y-3">{notesResult.data.map(n=><li key={n.id} className="rounded-lg border border-line p-3"><p className="text-xs text-muted">{label(n.visibility)} · <Time value={n.created_at} zone={zone}/></p><p className="mt-2 whitespace-pre-wrap text-sm">{n.body}</p></li>)}</ul>:<Empty>No booking notes recorded.</Empty>}</Card>
  <Card title="Payment records"><PaymentsTable rows={data.payments??[]} zone={zone}/><p className="mt-3 text-xs text-muted">Collection totals are gross receipts. Refunds are tracked separately in Payments.</p></Card>
  <Card title="Appointment history">{data.events?.length?<ol className="space-y-4 border-l-2 border-line pl-5">{data.events.map(e=><li key={e.id}><p className="text-sm capitalize">{e.from_state?`${label(e.from_state)} → `:"Requested → "}<Status value={e.to_state}/></p><p className="mt-1 text-xs text-muted"><Time value={e.created_at} zone={zone}/></p>{e.reason&&<p className="mt-2 whitespace-pre-wrap text-sm">{e.reason}</p>}</li>)}</ol>:<Empty>No transition events recorded.</Empty>}</Card></div></>;
}
export async function CustomersPage({search}:{search:SearchParams}) {
  const {data,filters}=await readCustomerDirectory(search); const kind=filters.kind;
  const hrefFor=(nextKind:"accounts"|"guests")=>{
    const params=new URLSearchParams({kind:nextKind});if(filters.q)params.set("q",filters.q);
    return `/admin/customers?${params.toString()}`;
  };
  return <><PageHeading title="Customers" description={kind==="accounts"?"Registered customers, with one directory entry per customer account.":"Guest contact records from bookings made without a customer account."}/>
    <nav aria-label="Customer record type" className="mb-5 flex flex-wrap gap-2">
      {([ ["accounts","Accounts"], ["guests","Guest bookings"] ] as const).map(([value,title])=><Link key={value} href={hrefFor(value)} aria-current={kind===value?"page":undefined} className={kind===value?"button-primary min-h-10":"button-secondary min-h-10"}>{title}</Link>)}
    </nav>
    <form action="/admin/customers" method="get" className="mb-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
      <input type="hidden" name="kind" value={kind}/>
      <label className="w-full text-sm font-medium sm:max-w-md">Search<input name="q" maxLength={100} defaultValue={filters.q} placeholder="Name, email or phone" className={`${inputClass} mt-1.5`}/></label>
      <div className="flex items-center gap-4"><button className={buttonClass}>Apply filters</button><Link href={hrefFor(kind)} className="text-sm text-accent-dark">Clear</Link></div>
    </form>
    {kind==="guests"&&<p className="mb-5 rounded-xl bg-canvas px-4 py-3 text-sm leading-6 text-muted">One guest contact record is saved per booking. Similar email addresses do not automatically identify the same person or link a record to an account.</p>}
    {data.customers.length?<Table headers={["Customer","Contact","Appointments","Last appointment","Upcoming reservation"]}>{data.customers.map(c=><tr key={c.id}><td><Link className="font-medium text-accent-dark underline" href={`/admin/customers/${c.id}`}>{c.display_name}</Link><p className="mt-1 text-xs text-muted">{kind==="accounts"?"Customer account":"Guest booking contact"}</p></td><td><p>{c.email??"—"}</p><p className="mt-1 text-xs text-muted">{c.phone??"—"}</p></td><td>{c.appointment_count}</td><td><Time value={c.last_appointment} zone={data.timezone}/></td><td><Time value={c.next_appointment} zone={data.timezone}/></td></tr>)}</Table>:<Empty>{kind==="accounts"?"No customer accounts match this search.":"No guest booking contacts match this search."}</Empty>}
    {data.total>25&&<Pagination path="/admin/customers" page={data.page} total={data.total} query={{kind,q:filters.q}}/>}
  </>;
}
export async function CustomerPage({id,search}:{id:string;search:SearchParams}) {
  const {data}=await readAdmin("customer",search,z.uuid().safeParse(id).success?id:"00000000-0000-0000-0000-000000000000");
  const c=data.customer;if(!c)notFound();const zone=zoneOf(data);
  return <><PageHeading title={c.display_name} description="Customer details and appointment history"><BackButton href="/admin/customers">Back to customers</BackButton></PageHeading><div className="space-y-6">
    <Card title="Customer information"><dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-muted">Email</dt><dd className="break-words">{c.email??"—"}</dd></div><div><dt className="text-muted">Phone</dt><dd>{c.phone??"—"}</dd></div><div><dt className="text-muted">Next reservation</dt><dd><Time value={data.next_appointment} zone={zone}/></dd></div><div><dt className="text-muted">No-shows</dt><dd>{data.no_shows??0}</dd></div></dl></Card>
    <Card title="Upcoming appointments"><AppointmentTable rows={data.upcoming??[]} zone={zone}/><p className="mt-3 text-xs text-muted">Next 10 accepted reservations. All appointments are included in the paginated history below.</p></Card>
    <Card title="Appointments"><div className="mb-4 flex gap-4 text-sm"><Link href={`/admin/customers/${id}`} className="text-accent-dark">All history</Link><Link href={`/admin/customers/${id}?status=NO_SHOW`} className="text-accent-dark">No-show history</Link></div><AppointmentTable rows={data.appointments??[]} zone={zone}/><Pagination path={`/admin/customers/${id}`} page={data.page} total={data.total??0} query={{status:typeof search.status==="string"?search.status:""}}/></Card>
  </div></>;
}
export async function PaymentsPage({search}:{search:SearchParams}) {
  const {data}=await readAdmin("payments",search);
  return <><PageHeading title="Payments" description="Review payment attempts, verified collections and recorded refunds."/><Card title="Payment activity"><p className="mb-5 text-sm leading-6 text-muted">Each record shows the payment state first. Open payment details for provider references, appointment state or reconciliation notes.</p><PaymentsTable rows={data.payments??[]} zone={zoneOf(data)}/><Pagination path="/admin/payments" page={data.page} total={data.total??0}/></Card></>;
}
export async function ReportsPage() {
  return <FinancialMetricsPage/>;
}
