import Link from "next/link";
import {notFound} from "next/navigation";
import {z} from "zod";
import {readCatalog} from "./data.server";
import {CategoryForm,ServiceForm,StaffForm,AssignmentForm,ExceptionForm,RemoveException,ImageControl} from "./forms";
import {HoursForm} from "@/features/admin/forms";
import {saveStaffHours} from "./actions";
import {PageHeading,Card,Empty,Table,Pagination,Time,AppointmentTable,buttonClass,inputClass} from "@/features/admin/ui";
import {money} from "@/features/admin/format";
import type {SearchParams} from "@/features/admin/data.server";
export async function CatalogList({kind,search}:{kind:"services"|"staff";search:SearchParams}){
 const {data,filters}=await readCatalog(kind,search);
 const title=kind==="services"?"Services":"Staff";
 return <><PageHeading title={title} description={kind==="services"?"Manage services, prices and payment requirements.":"Manage staff profiles, services and schedules. Staff profiles do not need login accounts."}><div className="flex flex-wrap gap-3"><Link className={buttonClass} href={`/admin/${kind}/new`}>Add {kind==="services"?"service":"staff profile"}</Link><Link className={buttonClass} href={kind==="services"?"/admin/services/categories":"/admin/staff/accounts"}>{kind==="services"?"Categories":"Staff login access"}</Link></div></PageHeading>
 <Card title={title}><form className="mb-6 grid items-end gap-3 sm:grid-cols-4"><label className="text-sm">Search<input className={inputClass} name="q" defaultValue={filters.q}/></label><label className="text-sm">Status<select className={inputClass} name="active" defaultValue={filters.active}><option value="">All</option><option value="true">Active</option><option value="false">Inactive / archived</option></select></label>{kind==="services"&&<label className="text-sm">Category<select className={inputClass} name="category" defaultValue={filters.category}><option value="">All categories</option>{data.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}<button className={buttonClass}>Filter</button></form>
 {!data.total?<Empty>No {kind} match this view.</Empty>:kind==="services"?<Table headers={["Service","Price / duration","Visibility","Payment"]}>{data.services?.map(s=><tr key={s.id}><td><Link className="font-medium text-accent-dark underline" href={`/admin/services/${s.id}`}>{s.name}</Link></td><td>{money(s.price_amount,data.business?.currency??"PHP")} · {s.duration_minutes} min</td><td>{s.active?"Active":"Archived"} · {s.published?"Published":"Unpublished"}</td><td>{s.payment_mode.replaceAll("_"," ").toLowerCase()}</td></tr>)}</Table>:<Table headers={["Staff","Status","Public booking"]}>{data.staff?.map(s=><tr key={s.id}><td><Link className="font-medium text-accent-dark underline" href={`/admin/staff/${s.id}`}>{s.display_name}</Link></td><td>{s.active?"Active":"Inactive"}</td><td>{s.published&&s.bookable?"Enabled":"Disabled"}</td></tr>)}</Table>}
 <Pagination path={`/admin/${kind}`} page={data.page} total={data.total} query={{q:filters.q,active:filters.active,category:filters.category}}/></Card></>;
}
export async function CatalogEditor({kind,id}:{kind:"services"|"staff";id?:string}){
 if(id&&!z.uuid().safeParse(id).success)notFound();
 const {data}=await readCatalog(kind,{},id);const row=kind==="services"?data.services?.[0]:data.staff?.[0];
 if(id&&!row)notFound();const zone=data.business?.timezone??"UTC";
 return <><PageHeading title={id?"Edit "+(kind==="services"?"service":"staff profile"):"Add "+(kind==="services"?"service":"staff profile")} description="Save profile details before adding images or schedules."><Link href={`/admin/${kind}`} className="text-sm text-accent-dark underline">Back to {kind}</Link></PageHeading>
 <div className="space-y-6"><Card title="Details">{kind==="services"?<ServiceForm data={data} row={id?data.services?.[0]:undefined}/>:<StaffForm row={id?data.staff?.[0]:undefined}/>}</Card>
 {id&&row&&<Card title="Public image"><ImageControl id={id} kind={kind} path={kind==="services"?data.services?.[0]?.image_path??null:data.staff?.[0]?.photo_path??null}/></Card>}
 {id&&kind==="services"&&<Card title="Capable staff">{!data.assignments?.length?<Empty>No staff assigned. Assign this service from a staff profile.</Empty>:<ul className="space-y-2">{data.assignments.map(a=><li key={a.staff_id}><Link className="text-accent-dark underline" href={`/admin/staff/${a.staff_id}`}>{data.staff_options.find(s=>s.id===a.staff_id)?.display_name??"Staff"}</Link></li>)}</ul>}<Link className="mt-4 block text-sm text-accent-dark underline" href="/admin/staff">Manage staff assignments</Link></Card>}
 {id&&kind==="staff"&&<><Card title="Services offered"><AssignmentForm id={id} data={data}/></Card><Card title={`Regular schedule · ${zone}`}><p className="mb-4 text-sm text-muted">Effective availability is the intersection of business hours and staff hours, minus closures and unavailable periods.</p><HoursForm action={saveStaffHours} hidden={{staff_id:id}} rows={(data.hours??[]).map(h=>({weekday:h.weekday,opens_at:h.starts_at,closes_at:h.ends_at}))}/></Card><Card title="Add break, leave or extra hours"><ExceptionForm id={id} zone={zone}/></Card><Card title="Schedule exceptions (latest 100)">{!data.exceptions?.length?<Empty>No exceptions.</Empty>:<div className="space-y-5">{data.exceptions.map(e=><div key={e.id} className="rounded-lg border p-4"><p>{e.kind.replaceAll("_"," ")} · {e.reason}</p><p className="mb-3 text-sm"><Time value={e.starts_at} zone={zone}/> – <Time value={e.ends_at} zone={zone}/></p><RemoveException id={e.id}/></div>)}</div>}</Card><Card title="Upcoming appointments (next 25)"><AppointmentTable rows={data.upcoming??[]} zone={zone}/></Card></>}
 </div></>;
}
export async function CategoriesPage(){const {data}=await readCatalog("services");return <><PageHeading title="Service categories" description="Lower display order appears first. Deactivate categories to stop new bookings for their services."/><div className="space-y-6"><Card title="New category"><CategoryForm/></Card>{data.categories.map(c=><Card key={c.id} title={c.name}><CategoryForm row={c}/></Card>)}</div></>;}

