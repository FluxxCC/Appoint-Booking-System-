"use client";
import { useActionState, useId, useState } from "react";
import type { FormState } from "@/features/auth/schemas";
import type { AdminData } from "./types";
import { saveSettings,saveApprovalMode,saveHours,saveClosure,saveAnnouncement,deleteClosure,deleteAnnouncement } from "./actions";
import { localInput } from "./format";
import { formatClockTime } from "@/lib/time";

const input="field-control text-sm";
const button="button-primary disabled:cursor-not-allowed disabled:opacity-50";
export type Field={name:string;label:string;value?:string|number|boolean;type?:string;hint?:string;required?:boolean;min?:number;max?:number;step?:string;minLength?:number;maxLength?:number;options?:{value:string;label:string}[];section?:string;sectionHint?:string;fullWidth?:boolean;showWhen?:{name:string;value:string|boolean}};
function Feedback({state}:{state:FormState}) { return <>{state.error&&<p role="alert" className="rounded-xl border border-danger/20 bg-danger-soft p-4 text-sm leading-6 text-danger">{state.error}</p>}{state.success&&<p role="status" className="rounded-xl border border-accent/15 bg-accent-soft p-4 text-sm leading-6 text-accent-dark">{state.success}</p>}</>; }
function Fields({fields}:{fields:Field[]}) {
  const prefix=useId();
  const [values,setValues]=useState<Record<string,string|number|boolean>>(()=>Object.fromEntries(fields.map(field=>[field.name,field.value??""])));
  const isVisible=(field:Field)=>!field.showWhen||values[field.showWhen.name]===field.showWhen.value;
  const groups=fields.reduce<{title:string;hint?:string;fields:Field[]}[]>((all,field)=>{
    const current=all[all.length-1];
    if(field.section&&current?.title!==field.section)all.push({title:field.section,hint:field.sectionHint,fields:[]});
    else if(!current)all.push({title:"",fields:[]});
    all[all.length-1].fields.push(field);
    return all;
  },[]);
  return <div className="space-y-5">{groups.map((group,index)=><section key={`${group.title}-${index}`} hidden={!group.fields.some(isVisible)} className={group.title?"rounded-2xl border border-line bg-white p-4 sm:p-5":""}>
    {group.title&&<div className="mb-5 border-b border-line pb-3"><h3 className="text-sm font-semibold tracking-tight text-ink">{group.title}</h3>{group.hint&&<p className="mt-1 text-sm leading-5 text-muted">{group.hint}</p>}</div>}
    <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-5">{group.fields.map(f=>{
      const id=`${prefix}-${f.name}`;
      const description=f.hint?`${id}-hint`:undefined;
      if(f.type==="checkbox")return <label key={f.name} hidden={!isVisible(f)} htmlFor={id} className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border border-line bg-canvas/50 p-4 transition hover:border-accent/40 hover:bg-accent-soft/40 ${f.fullWidth===false?"":"sm:col-span-2"}`}>
        <input id={id} name={f.name} type="checkbox" defaultChecked={Boolean(f.value)} onChange={event=>setValues(current=>({...current,[f.name]:event.target.checked}))} className="mt-0.5 size-5 shrink-0 accent-accent" aria-describedby={description}/>
        <span className="min-w-0"><span className="block text-sm font-medium text-ink">{f.label}</span>{f.hint&&<span id={description} className="mt-1 block text-xs leading-5 text-muted">{f.hint}</span>}</span>
      </label>;
      return <div key={f.name} hidden={!isVisible(f)} className={f.type==="textarea"||f.fullWidth?"sm:col-span-2":""}>
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">{f.label}{f.required&&<span aria-hidden="true" className="ml-1 text-danger">*</span>}</label>
        {f.options?<select id={id} name={f.name} defaultValue={String(f.value??"")} onChange={event=>setValues(current=>({...current,[f.name]:event.target.value}))} required={f.required} className={input}>{f.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:f.type==="textarea"?<textarea id={id} name={f.name} defaultValue={String(f.value??"")} rows={4} minLength={f.minLength} maxLength={f.maxLength} required={f.required} className={`${input} min-h-28 resize-y leading-6`} aria-describedby={description}/>:<input id={id} name={f.name} type={f.type??"text"} defaultValue={String(f.value??"")} required={f.required} min={f.min} max={f.max} step={f.step} minLength={f.minLength} maxLength={f.maxLength} className={input} aria-describedby={description}/>}
        {f.hint&&<p id={description} className="mt-1.5 text-xs leading-5 text-muted">{f.hint}</p>}
      </div>;
    })}</div>
  </section>)}</div>;
}
export function Form({action,fields,advancedFields,advancedTitle="More options",advancedHint="These settings are optional and can be changed later.",hidden={},submit="Save changes",submitClassName=button,children}:{action:(s:FormState,f:FormData)=>Promise<FormState>;fields:Field[];advancedFields?:Field[];advancedTitle?:string;advancedHint?:string;hidden?:Record<string,string>;submit?:string;submitClassName?:string;children?:React.ReactNode}) {
  const [state,dispatch,pending]=useActionState(action,{});
  return <form action={dispatch} aria-busy={pending} className="space-y-6">{Object.entries(hidden).map(([name,value])=><input key={name} type="hidden" name={name} value={value}/>)}<fieldset disabled={pending} className="space-y-6">{fields.length>0&&<Fields fields={fields}/>} {advancedFields?.length ? <details className="group overflow-hidden rounded-2xl border border-line bg-white"><summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 marker:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:px-5 [&::-webkit-details-marker]:hidden"><span className="min-w-0"><span className="block text-sm font-semibold text-ink">{advancedTitle}</span><span className="mt-1 block text-sm leading-5 text-muted">{advancedHint}</span></span><span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-lg font-medium text-accent-dark transition-transform group-open:rotate-45">+</span></summary><div className="border-t border-line px-4 py-4 sm:px-5"><Fields fields={advancedFields}/></div></details> : null}{children}<div className="border-t border-line pt-5"><button className={`${submitClassName} w-full sm:w-auto`} disabled={pending}>{pending?"Saving…":submit}</button></div></fieldset>{(state.error||state.success)&&<div><Feedback state={state}/></div>}</form>;
}
export function SettingsForm({data,section="all"}:{data:AdminData;section?:"all"|"profile"|"booking"|"policies"}) {
  const b=data.business, p=data.policy;
  const fields:Field[]=[
    {section:"Business profile",sectionHint:"The public contact and description customers see.",name:"name",label:"Business name",value:b?.name,required:true,maxLength:200},
    {name:"contact_email",label:"Business email",type:"email",value:b?.contact_email??"",maxLength:254},
    {name:"contact_phone",label:"Phone number",type:"tel",value:b?.contact_phone??"",maxLength:40},
    {name:"address",label:"Business location address",value:b?.address??"",maxLength:1000,hint:"This is your business address. Home Service customers enter their visit destination when booking."},
    {name:"description",label:"Business description",type:"textarea",value:b?.description,maxLength:4000},
    {section:"Time and booking defaults",sectionHint:"These defaults apply to new scheduling and service setup.",name:"timezone",label:"Business timezone",value:b?.timezone??"Asia/Manila",required:true,hint:"Use an IANA timezone such as Asia/Manila. Locked after appointments exist."},
    {name:"currency",label:"Currency",value:b?.currency??"PHP",required:true,hint:"ISO currency code, such as PHP, USD or EUR. Locked after appointments exist."},
    {name:"scheduling_interval_minutes",label:"Booking time-slot interval (minutes)",type:"number",value:b?.scheduling_interval_minutes??15,min:5,max:120,required:true,hint:"Controls the spacing of future start times in the booking calendar."},
    {name:"default_buffer_minutes",label:"Default service buffer (minutes)",type:"number",value:b?.default_buffer_minutes??0,min:0,max:240,required:true,hint:"Used as the starting default for new services. Existing services keep their own buffers."},
    {section:"Booking rules",sectionHint:"Control when customers may book and how long a payment window stays open.",name:"minimum_notice_minutes",label:"Minimum booking notice (minutes)",type:"number",value:p?.minimum_notice_minutes??60,min:0,max:1051200,required:true},
    {name:"maximum_advance_days",label:"How far ahead customers can book (days)",type:"number",value:p?.maximum_advance_days??90,min:1,max:730,required:true},
    {name:"payment_window_minutes",label:"Payment deadline after acceptance (minutes)",type:"number",value:p?.payment_window_minutes??30,min:1,max:1440,required:true},
    {name:"guest_booking_enabled",label:"Allow guest bookings",type:"checkbox",value:b?.guest_booking_enabled??true,hint:"Customers can request an appointment without creating an account."},
    {name:"customer_registration_enabled",label:"Allow customer account registration",type:"checkbox",value:b?.customer_registration_enabled??true,hint:"Turning this off blocks new self-registration. Existing accounts remain available."},
    {section:"Customer policies",sectionHint:"These policies are shown to customers during booking and on the refund policy page.",name:"terms",label:"Booking policy",type:"textarea",value:p?.terms??"",maxLength:10000,required:true,hint:"Saving changes publishes a new policy version. Existing requests keep the policy they accepted."},
    {name:"refund_policy",label:"Refund policy",type:"textarea",value:b?.refund_policy??"",maxLength:10000,required:true,hint:"This appears on the public refund policy page. Review it for your business before saving."},
  ];
  const groups={profile:["Business profile","Time and booking defaults"],booking:["Booking rules"],policies:["Customer policies"]} as const;
  const targetGroups:readonly string[]=section==="profile"?groups.profile:section==="booking"?groups.booking:groups.policies;
  let currentGroup="";
  const visible=section==="all"?fields:fields.filter(field=>{
    if(field.section)currentGroup=field.section;
    return targetGroups.includes(currentGroup);
  });
  const visibleNames=new Set(visible.map(field=>field.name));
  const values:Record<string,string>={
    name:b?.name??"",description:b?.description??"",contact_email:b?.contact_email??"",contact_phone:b?.contact_phone??"",address:b?.address??"",timezone:b?.timezone??"Asia/Manila",currency:b?.currency??"PHP",scheduling_interval_minutes:String(b?.scheduling_interval_minutes??15),default_buffer_minutes:String(b?.default_buffer_minutes??0),minimum_notice_minutes:String(p?.minimum_notice_minutes??60),maximum_advance_days:String(p?.maximum_advance_days??90),payment_window_minutes:String(p?.payment_window_minutes??30),terms:p?.terms??"",refund_policy:b?.refund_policy??"",expected_updated_at:data.expected_updated_at??"",
  };
  const hidden:Record<string,string>={};
  for(const [name,value] of Object.entries(values))if(!visibleNames.has(name))hidden[name]=value;
  for(const name of ["guest_booking_enabled","customer_registration_enabled"]){
    const enabled=name==="guest_booking_enabled"?Boolean(b?.guest_booking_enabled??true):Boolean(b?.customer_registration_enabled??true);
    if(!visibleNames.has(name))hidden[name]=String(enabled);
  }
  return <Form action={saveSettings} hidden={hidden} fields={visible}>{section==="booking"&&<p className="rounded-xl border border-info/15 bg-info-soft/60 p-4 text-sm leading-6 text-ink">Payments are requested only after a booking is accepted. Saving policy changes applies them to new booking requests.</p>}</Form>;
}
export function ApprovalModeForm({mode}:{mode:string}) {
  return <Form action={saveApprovalMode} submit="Save approval mode" fields={[{name:"mode",label:"How requests are approved",value:mode,required:true,options:[
    {value:"ADMIN_APPROVAL",label:"Owner or administrator reviews requests"},
    {value:"STAFF_APPROVAL",label:"Assigned staff reviews requests; owner and administrator can help"},
    {value:"AUTO_CONFIRM",label:"Reserve an available slot as soon as a request is submitted"},
  ]}]}/>;
}
type Interval={weekday:number;opens_at:string;closes_at:string};
function parseClockTime(value:string) {
  const match=value.trim().match(/^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/i);
  if(!match)return null;
  const hour=Number(match[1]);
  if(hour<1||hour>12)return null;
  const hour24=(hour%12)+(match[3].toUpperCase()==="PM"?12:0);
  return `${String(hour24).padStart(2,"0")}:${match[2]}`;
}
function ClockTimeField({label,ariaLabel,value,onChange}:{label:string;ariaLabel:string;value:string;onChange:(value:string)=>void}) {
  const [draft,setDraft]=useState<string|null>(null);
  return <label className="min-w-0 text-xs font-medium text-muted">{label}<input aria-label={ariaLabel} type="text" inputMode="text" autoComplete="off" required pattern="\d{1,2}:[0-5]\d\s*(AM|PM|am|pm|Am|Pm)" title="Enter a time like 9:00 AM or 1:00 PM." placeholder="9:00 AM" value={draft??formatClockTime(value)} className={`${input} mt-1.5 px-2.5`} onChange={event=>{const next=event.target.value;setDraft(next);const parsed=parseClockTime(next);if(parsed)onChange(parsed);}} onBlur={()=>{if(parseClockTime(draft??"")!==null)setDraft(null);}}/></label>;
}
export function HoursForm({rows,action=saveHours,hidden={}}:{rows:{weekday:number;opens_at:string;closes_at:string}[];action?:(s:FormState,f:FormData)=>Promise<FormState>;hidden?:Record<string,string>}) {
  const [hours,setHours]=useState<Interval[]>(rows.map(r=>({weekday:r.weekday,opens_at:r.opens_at.slice(0,5),closes_at:r.closes_at.slice(0,5)})));
  const [state,dispatch,pending]=useActionState(action,{});
  const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  return <form action={dispatch} className="space-y-5" aria-busy={pending}>
    {Object.entries(hidden).map(([name,value])=><input type="hidden" key={name} name={name} value={value}/>)}
    <input type="hidden" name="intervals" value={JSON.stringify(hours)}/>
    <p className="text-sm leading-6 text-muted">Hours use the business timezone. Enter times like 9:00 AM or 1:00 PM. Leave a day with no intervals closed. You can add up to four intervals per day.</p>
    <fieldset disabled={pending} className="space-y-5">
      <div className="responsive-table overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-accent-soft/60 text-xs text-muted"><tr><th scope="col" className="whitespace-nowrap px-4 py-3.5 font-semibold">Day</th><th scope="col" className="px-4 py-3.5 font-semibold">Business hours</th><th scope="col" className="whitespace-nowrap px-4 py-3.5 font-semibold">Actions</th></tr></thead>
          <tbody className="divide-y divide-line [&_td]:px-4 [&_td]:py-4 [&_td]:align-top">
            {days.map((day,weekday)=>{
              const intervals=hours.map((row,index)=>({row,index})).filter(({row})=>row.weekday===weekday);
              return <tr key={day}>
                <td data-label="Day"><div className="flex items-center justify-between gap-3 sm:block"><span className="font-semibold text-ink">{day}</span><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${intervals.length?"bg-success-soft text-success":"bg-canvas text-muted"}`}>{intervals.length?`${intervals.length} interval${intervals.length===1?"":"s"}` : "Closed"}</span></div></td>
                <td data-label="Business hours">{intervals.length===0?<span className="text-sm text-muted">No hours set</span>:<div className="space-y-2">{intervals.map(({row,index},intervalNumber)=><div key={index} className="grid grid-cols-2 items-end gap-3 rounded-xl border border-line bg-canvas/50 p-3 sm:grid-cols-[minmax(112px,1fr)_auto_minmax(112px,1fr)_auto] sm:gap-2">
                  <ClockTimeField label="Opens" ariaLabel={`${day} interval ${intervalNumber+1} opening time`} value={row.opens_at} onChange={value=>setHours(hours.map((item,i)=>i===index?{...item,opens_at:value}:item))}/>
                  <span className="hidden pb-3 text-xs text-muted sm:block">to</span>
                  <ClockTimeField label="Closes" ariaLabel={`${day} interval ${intervalNumber+1} closing time`} value={row.closes_at} onChange={value=>setHours(hours.map((item,i)=>i===index?{...item,closes_at:value}:item))}/>
                  <button type="button" className="col-span-2 justify-self-start text-xs font-medium text-danger underline-offset-4 hover:underline sm:col-span-1" onClick={()=>setHours(hours.filter((_,i)=>i!==index))}>Remove</button>
                </div>)}</div>}</td>
                <td data-label="Actions"><button type="button" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line px-3 py-2 text-xs font-semibold text-accent-dark transition hover:border-accent/40 hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50" disabled={intervals.length>=4} onClick={()=>setHours([...hours,{weekday,opens_at:"09:00",closes_at:"18:00"}])}>Add interval</button></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-line pt-5"><button className={`${button} w-full sm:w-auto`} disabled={pending}>{pending?"Saving…":"Save weekly hours"}</button></div>
    </fieldset>
    <Feedback state={state}/>
  </form>;
}
export function ClosureForm() {
  const [state,dispatch,pending]=useActionState(saveClosure,{});
  const [mode,setMode]=useState<"full"|"partial">("full");
  const [date,setDate]=useState("");
  const [reason,setReason]=useState("");
  const fullDay=mode==="full";
  return <form action={dispatch} aria-busy={pending} className="space-y-6">
    <fieldset disabled={pending} className="space-y-6">
      <input type="hidden" name="full_day" value={String(fullDay)}/>
      <section aria-labelledby="closure-date-title" className="space-y-4">
        <div><h3 id="closure-date-title" className="text-sm font-semibold text-ink">When should bookings be blocked?</h3><p className="mt-1 text-sm leading-5 text-muted">Choose the date first. Times follow the business timezone.</p></div>
        <label className="block max-w-sm text-sm font-medium text-ink" htmlFor="closure-date">Closure date<span aria-hidden="true" className="ml-1 text-danger">*</span>
          <input id="closure-date" name="date" type="date" required value={date} onChange={event=>setDate(event.target.value)} className={`${input} mt-1.5`}/>
        </label>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium text-ink">How long will you be closed?</legend>
          <label className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition ${fullDay?"border-accent bg-accent-soft/50":"border-line hover:border-accent/40"}`}>
            <input type="radio" name="closure-mode" value="full" checked={fullDay} onChange={()=>setMode("full")} className="mt-0.5 size-4 accent-accent"/>
            <span><span className="block text-sm font-semibold text-ink">All day</span><span className="mt-1 block text-xs leading-5 text-muted">No appointment times will be available on this date.</span></span>
          </label>
          <label className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition ${!fullDay?"border-accent bg-accent-soft/50":"border-line hover:border-accent/40"}`}>
            <input type="radio" name="closure-mode" value="partial" checked={!fullDay} onChange={()=>setMode("partial")} className="mt-0.5 size-4 accent-accent"/>
            <span><span className="block text-sm font-semibold text-ink">Specific hours</span><span className="mt-1 block text-xs leading-5 text-muted">Keep bookings open outside a time window.</span></span>
          </label>
        </fieldset>
        {!fullDay&&<div className="grid gap-4 rounded-xl border border-accent/20 bg-canvas/60 p-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-ink" htmlFor="closure-start">From<span aria-hidden="true" className="ml-1 text-danger">*</span><input id="closure-start" name="start" type="time" required className={`${input} mt-1.5`}/></label>
          <label className="text-sm font-medium text-ink" htmlFor="closure-end">Until<span aria-hidden="true" className="ml-1 text-danger">*</span><input id="closure-end" name="end" type="time" required className={`${input} mt-1.5`}/></label>
          <p className="text-xs leading-5 text-muted sm:col-span-2">The end time must be later than the start time. For closures spanning midnight, add a separate closure for each date.</p>
        </div>}
      </section>
      <section aria-labelledby="closure-message-title" className="space-y-3 border-t border-line pt-5">
        <div><h3 id="closure-message-title" className="text-sm font-semibold text-ink">What should customers see?</h3><p className="mt-1 text-sm leading-5 text-muted">This message appears when customers check availability during the closure.</p></div>
        <label className="block text-sm font-medium text-ink" htmlFor="closure-reason">Customer-facing message<span aria-hidden="true" className="ml-1 text-danger">*</span>
          <textarea id="closure-reason" name="reason" required maxLength={500} value={reason} onChange={event=>setReason(event.target.value)} placeholder="For example: Closed for a private event" rows={3} className={`${input} mt-1.5 min-h-24 resize-y leading-6`}/>
        </label>
        <p className="text-right text-xs tabular-nums text-muted">{reason.length}/500</p>
      </section>
      {date&&<p className="rounded-xl bg-canvas p-4 text-sm leading-6 text-muted"><strong className="text-ink">Review:</strong> {date} · {fullDay?"All day":"Specific hours"}. Existing appointments remain unchanged.</p>}
      <div className="border-t border-line pt-5"><button className={`${button} w-full sm:w-auto`} disabled={pending}>{pending?"Saving closure…":"Schedule closure"}</button></div>
    </fieldset>
    {(state.error||state.success)&&<Feedback state={state}/>}
  </form>;
}
export function AnnouncementForm({row,zone}:{row?:NonNullable<AdminData["announcements"]>[number];zone:string}) { return <Form action={saveAnnouncement} hidden={{id:row?.id??""}} submit={row?"Save announcement":"Create announcement"} fields={[
  {section:"Announcement content",sectionHint:"Write a concise update for customers.",name:"title",label:"Title",value:row?.title,required:true,maxLength:200},
  {name:"body",label:"Message",type:"textarea",value:row?.body,required:true,maxLength:10000},
  {name:"published",label:"Publish this announcement",type:"checkbox",value:row?.published??false,hint:"Published announcements appear during their scheduled display period."},
  {section:"Display schedule",sectionHint:`Times are in ${zone}.`,name:"start",label:"Display starts",type:"datetime-local",value:row?localInput(row.starts_at,zone):"",hint:"Leave blank to start immediately."},
  {name:"end",label:"Display ends",type:"datetime-local",value:row?.ends_at?localInput(row.ends_at,zone):"",hint:"Leave blank to keep displaying until unpublished."},
]}/>; }
export function DeleteForm({id,kind}:{id:string;kind:"closure"|"announcement"}) {
  const [state,dispatch,pending]=useActionState(kind==="closure"?deleteClosure:deleteAnnouncement,{});
  return <form action={dispatch} onSubmit={e=>{if(!window.confirm(`Permanently delete this ${kind}? ${kind==="closure"?"The affected time will reopen for scheduling.":"It will no longer be displayed."}`)) e.preventDefault();}} className="mt-4 space-y-3"><input type="hidden" name="id" value={id}/><button disabled={pending} className="rounded-lg border border-danger/30 px-3 py-2 text-sm text-danger disabled:opacity-50">{pending?"Deleting…":`Delete ${kind}`}</button><Feedback state={state}/></form>;
}
