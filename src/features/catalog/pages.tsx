import Link from "next/link";
import { BackButton } from "@/components/ui/back-button";
import {notFound} from "next/navigation";
import {z} from "zod";
import {readCatalog} from "./data.server";
import {CategoryForm,ServiceForm,StaffForm,AssignmentForm,ExceptionForm,RemoveException,ImageControl} from "./forms";
import {CategoryOrderTable} from "./category-order-table";
import {HoursForm} from "@/features/admin/forms";
import {saveStaffHours} from "./actions";
import {PageHeading,Card,Empty,Table,Pagination,Time,AppointmentTable,buttonClass,inputClass} from "@/features/admin/ui";
import {money} from "@/features/admin/format";
import type {SearchParams} from "@/features/admin/data.server";
export async function CatalogList({kind,search}:{kind:"services"|"staff";search:SearchParams}){
 const {data,filters}=await readCatalog(kind,search);
 const title=kind==="services"?"Services":"Staff";
 return <><PageHeading title={title} description={kind==="services"?"Manage services, prices and payment requirements.":"Manage staff profiles, services and schedules. Staff profiles do not need login accounts."}><div className="flex flex-wrap gap-3"><Link className={buttonClass} href={`/admin/${kind}/new`}>Add {kind==="services"?"service":"staff profile"}</Link><Link className={buttonClass} href={kind==="services"?"/admin/services/categories":"/admin/staff/accounts"}>{kind==="services"?"Categories":"Staff login access"}</Link></div></PageHeading>
 <Card title={title}><form action={`/admin/${kind}`} method="get" role="search" className="mb-6 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-sm">Search<input className={inputClass} name="q" placeholder={kind==="services"?"Service name or URL name":"Staff name"} defaultValue={filters.q}/></label><label className="text-sm">Status<select className={inputClass} name="active" defaultValue={filters.active}><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive / archived</option></select></label>{kind==="services"&&<label className="text-sm">Category<select className={inputClass} name="category" defaultValue={filters.category}><option value="">All categories</option>{data.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}<div className="flex flex-wrap items-center gap-4"><button type="submit" className={buttonClass}>Apply filters</button><Link className="text-sm font-medium text-accent-dark underline-offset-4 hover:underline" href={`/admin/${kind}`}>Clear</Link></div></form>
 {!data.total?<Empty>No {kind} match this view.</Empty>:kind==="services"?<Table headers={["Service","Price / duration","Fulfillment","Home Service fee · travel","Visibility","Payment","Actions"]}>{data.services?.map(s=><tr key={s.id}><td><Link className="font-medium text-accent-dark underline" href={`/admin/services/${s.id}`}>{s.name}</Link></td><td>{money(s.price_amount,data.business?.currency??"PHP")} · {s.duration_minutes} min</td><td><p>At business: {s.supports_business_location?"Enabled":"Disabled"}</p><p className="mt-1">Home Service: {s.supports_home_service?"Enabled":"Disabled"}</p></td><td>{s.supports_home_service?<>{money(s.home_service_fee,data.business?.currency??"PHP")}<p className="mt-1 text-xs text-muted">{s.home_travel_before_minutes} min before · {s.home_travel_after_minutes} min after</p></>:"—"}</td><td>{s.active?"Active":"Archived"} · {s.published?"Published":"Unpublished"}</td><td>{s.payment_mode.replaceAll("_"," ").toLowerCase()}</td><td><Link className="button-secondary inline-flex min-h-10 items-center whitespace-nowrap px-3 py-2 text-sm" href={`/admin/services/${s.id}`}>Edit service</Link></td></tr>)}</Table>:<Table headers={["Staff","Status","Public booking"]}>{data.staff?.map(s=><tr key={s.id}><td><Link className="font-medium text-accent-dark underline" href={`/admin/staff/${s.id}`}>{s.display_name}</Link></td><td>{s.active?"Active":"Inactive"}</td><td>{s.published&&s.bookable?"Enabled":"Disabled"}</td></tr>)}</Table>}
 <Pagination path={`/admin/${kind}`} page={data.page} total={data.total} query={{q:filters.q,active:filters.active,category:filters.category}}/></Card></>;
}
export async function CatalogEditor({kind,id}:{kind:"services"|"staff";id?:string}){
 if(id&&!z.uuid().safeParse(id).success)notFound();
 const {data}=await readCatalog(kind,{},id);const row=kind==="services"?data.services?.[0]:data.staff?.[0];
 if(id&&!row)notFound();const zone=data.business?.timezone??"UTC";
 return <><PageHeading title={id?"Edit "+(kind==="services"?"service":"staff profile"):"Add "+(kind==="services"?"service":"staff profile")} description="Save profile details before adding images or schedules."><BackButton href={`/admin/${kind}`}>Back to {kind}</BackButton></PageHeading>
 <div className="space-y-6"><Card title="Details">{kind==="services"?<ServiceForm data={data} row={id?data.services?.[0]:undefined}/>:<StaffForm row={id?data.staff?.[0]:undefined}/>}</Card>
 {id&&row&&<Card title="Public image"><ImageControl id={id} kind={kind} path={kind==="services"?data.services?.[0]?.image_path??null:data.staff?.[0]?.photo_path??null}/></Card>}
 {id&&kind==="services"&&<Card title="Capable staff">{!data.assignments?.length?<Empty>No staff assigned. Assign this service from a staff profile.</Empty>:<ul className="space-y-2">{data.assignments.map(a=><li key={a.staff_id}><Link className="text-accent-dark underline" href={`/admin/staff/${a.staff_id}`}>{data.staff_options.find(s=>s.id===a.staff_id)?.display_name??"Staff"}</Link></li>)}</ul>}<Link className="mt-4 block text-sm text-accent-dark underline" href="/admin/staff">Manage staff assignments</Link></Card>}
 {id&&kind==="staff"&&<><Card title="Services offered"><AssignmentForm id={id} data={data}/></Card><Card title={`Regular schedule · ${zone}`}><p className="mb-4 text-sm text-muted">Effective availability is the intersection of business hours and staff hours, minus closures and unavailable periods.</p><HoursForm action={saveStaffHours} hidden={{staff_id:id}} rows={(data.hours??[]).map(h=>({weekday:h.weekday,opens_at:h.starts_at,closes_at:h.ends_at}))}/></Card><Card title="Add break, leave or extra hours"><ExceptionForm id={id} zone={zone}/></Card><Card title="Schedule exceptions (latest 100)">{!data.exceptions?.length?<Empty>No exceptions.</Empty>:<div className="space-y-5">{data.exceptions.map(e=><div key={e.id} className="rounded-lg border p-4"><p>{e.kind.replaceAll("_"," ")} · {e.reason}</p><p className="mb-3 text-sm"><Time value={e.starts_at} zone={zone}/> – <Time value={e.ends_at} zone={zone}/></p><RemoveException id={e.id}/></div>)}</div>}</Card><Card title="Upcoming appointments (next 25)"><AppointmentTable rows={data.upcoming??[]} zone={zone}/></Card></>}
 </div></>;
}
export async function CategoriesPage(){
 const {data}=await readCatalog("services");
 return <>
  <PageHeading title="Service categories" description="Organize customer-facing service groups. Drag categories to set their order and control which ones customers can see."><BackButton href="/admin/services">Back to services</BackButton></PageHeading>
  <details className="surface-card mb-6 overflow-hidden">
   <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:hidden sm:px-7 [&::-webkit-details-marker]:hidden">
    <span><span className="block font-semibold text-ink">Add category</span><span className="mt-1 block text-sm text-muted">Create a group for related services; it will be added at the end</span></span>
    <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-xl font-medium text-white">+</span>
   </summary>
   <div className="border-t border-line px-5 py-5 sm:px-7"><CategoryForm sortOrder={data.categories.length?Math.max(...data.categories.map(category=>category.sort_order))+1:0}/></div>
  </details>
  <Card title="Saved categories">
   {data.categories.length?<CategoryOrderTable categories={data.categories}/>:<Empty>No categories yet. Add a category to organize your services.</Empty>}
   {Boolean(data.categories.length)&&<p className="mt-4 text-xs leading-5 text-muted">Inactive categories are not available for new bookings. Hidden categories are not shown in the public service catalog.</p>}
  </Card>
 </>;
}
export async function CategoryEditor({id}:{id:string}){
 if(!z.uuid().safeParse(id).success)notFound();
 const {data}=await readCatalog("services");const row=data.categories.find(category=>category.id===id);
 if(!row)notFound();
 return <><PageHeading title="Edit category" description="Update the category name or customer visibility. Drag it in the category list to change its position."><BackButton href="/admin/services/categories">Back to categories</BackButton></PageHeading><Card title={row.name}><CategoryForm row={row}/></Card></>;
}

