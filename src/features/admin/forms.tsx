"use client";
import { useActionState, useId, useState } from "react";
import type { FormState } from "@/features/auth/schemas";
import type { AdminData } from "./types";
import { saveSettings,saveHomeArea,saveApprovalMode,saveHours,saveClosure,saveAnnouncement,deleteClosure,deleteAnnouncement } from "./actions";
import { localInput } from "./format";
import { formatClockTime } from "@/lib/time";

const input="field-control text-sm";
const button="button-primary disabled:cursor-not-allowed disabled:opacity-50";
export type Field={name:string;label:string;value?:string|number|boolean;type?:string;hint?:string;required?:boolean;min?:number;max?:number;step?:string;minLength?:number;maxLength?:number;options?:{value:string;label:string}[];section?:string;sectionHint?:string;fullWidth?:boolean};
function Feedback({state}:{state:FormState}) { return <>{state.error&&<p role="alert" className="rounded-xl border border-danger/20 bg-danger-soft p-4 text-sm leading-6 text-danger">{state.error}</p>}{state.success&&<p role="status" className="rounded-xl border border-accent/15 bg-accent-soft p-4 text-sm leading-6 text-accent-dark">{state.success}</p>}</>; }
function Fields({fields}:{fields:Field[]}) {
  const prefix=useId();
  const groups=fields.reduce<{title:string;hint?:string;fields:Field[]}[]>((all,field)=>{
    const current=all[all.length-1];
    if(field.section&&current?.title!==field.section)all.push({title:field.section,hint:field.sectionHint,fields:[]});
    else if(!current)all.push({title:"",fields:[]});
    all[all.length-1].fields.push(field);
    return all;
  },[]);
  return <div className="space-y-5">{groups.map((group,index)=><section key={`${group.title}-${index}`} className={group.title?"rounded-2xl border border-line bg-white p-4 sm:p-5":""}>
    {group.title&&<div className="mb-5 border-b border-line pb-3"><h3 className="text-sm font-semibold tracking-tight text-ink">{group.title}</h3>{group.hint&&<p className="mt-1 text-sm leading-5 text-muted">{group.hint}</p>}</div>}
    <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-5">{group.fields.map(f=>{
      const id=`${prefix}-${f.name}`;
      const description=f.hint?`${id}-hint`:undefined;
      if(f.type==="checkbox")return <label key={f.name} htmlFor={id} className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border border-line bg-canvas/50 p-4 transition hover:border-accent/40 hover:bg-accent-soft/40 ${f.fullWidth===false?"":"sm:col-span-2"}`}>
        <input id={id} name={f.name} type="checkbox" defaultChecked={Boolean(f.value)} className="mt-0.5 size-5 shrink-0 accent-accent" aria-describedby={description}/>
        <span className="min-w-0"><span className="block text-sm font-medium text-ink">{f.label}</span>{f.hint&&<span id={description} className="mt-1 block text-xs leading-5 text-muted">{f.hint}</span>}</span>
      </label>;
      return <div key={f.name} className={f.type==="textarea"||f.fullWidth?"sm:col-span-2":""}>
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">{f.label}{f.required&&<span aria-hidden="true" className="ml-1 text-danger">*</span>}</label>
        {f.options?<select id={id} name={f.name} defaultValue={String(f.value??"")} required={f.required} className={input}>{f.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:f.type==="textarea"?<textarea id={id} name={f.name} defaultValue={String(f.value??"")} rows={4} minLength={f.minLength} maxLength={f.maxLength} required={f.required} className={`${input} min-h-28 resize-y leading-6`} aria-describedby={description}/>:<input id={id} name={f.name} type={f.type??"text"} defaultValue={String(f.value??"")} required={f.required} min={f.min} max={f.max} step={f.step} minLength={f.minLength} maxLength={f.maxLength} className={input} aria-describedby={description}/>}
        {f.hint&&<p id={description} className="mt-1.5 text-xs leading-5 text-muted">{f.hint}</p>}
      </div>;
    })}</div>
  </section>)}</div>;
}
export function Form({action,fields,hidden={},submit="Save changes",submitClassName=button,children}:{action:(s:FormState,f:FormData)=>Promise<FormState>;fields:Field[];hidden?:Record<string,string>;submit?:string;submitClassName?:string;children?:React.ReactNode}) {
  const [state,dispatch,pending]=useActionState(action,{});
  return <form action={dispatch} aria-busy={pending} className="space-y-6">{Object.entries(hidden).map(([name,value])=><input key={name} type="hidden" name={name} value={value}/>)}<fieldset disabled={pending} className="space-y-6">{fields.length>0&&<Fields fields={fields}/>} {children}<div className="border-t border-line pt-5"><button className={`${submitClassName} w-full sm:w-auto`} disabled={pending}>{pending?"Saving…":submit}</button></div></fieldset>{(state.error||state.success)&&<div><Feedback state={state}/></div>}</form>;
}
export function SettingsForm({data}:{data:AdminData}) {
  const b=data.business, p=data.policy;
  return <Form action={saveSettings} hidden={{expected_updated_at:data.expected_updated_at??""}} fields={[
    {section:"Business profile",sectionHint:"The public contact and description customers see.",name:"name",label:"Business name",value:b?.name,required:true,maxLength:200},
    {name:"contact_email",label:"Business email",type:"email",value:b?.contact_email??"",maxLength:254},
    {name:"contact_phone",label:"Phone number",type:"tel",value:b?.contact_phone??"",maxLength:40},
    {name:"address",label:"Address",value:b?.address??"",maxLength:1000},
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
  ]}><p className="rounded-xl border border-info/15 bg-info-soft/60 p-4 text-sm leading-6 text-ink">Payments are requested only after a booking is accepted. Saving policy changes applies them to new booking requests.</p></Form>;
}
export function HomeAreaForm({data}:{data:AdminData}){const b=data.business;return <Form action={saveHomeArea} submit="Save service area" fields={[
 {section:"Business map pin",sectionHint:"This is the service-area origin. It is never hardcoded and is not shown in the public catalog.",name:"latitude",label:"Latitude",type:"number",value:b?.service_origin_latitude??"",min:-90,max:90,step:"any"},
 {name:"longitude",label:"Longitude",type:"number",value:b?.service_origin_longitude??"",min:-180,max:180,step:"any"},
 {section:"Maximum Home Service radius",sectionHint:"Leave blank to disable radius enforcement. A radius requires both business coordinates.",name:"radius",label:"Maximum service radius (km)",type:"number",value:b?.home_service_max_radius_km??"",min:0.1,max:500,step:"any"},
 ]}><p className="rounded-xl bg-canvas p-4 text-sm leading-6 text-muted">Customers still choose a manual address or explicitly share their current device location. Home Service stores only the confirmed destination; there is no live tracking.</p></Form>}
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
export function ClosureForm() { return <Form action={saveClosure} submit="Create closure" fields={[
  {section:"Closure timing",sectionHint:"Choose a date and whether the business is closed all day or for part of the day.",name:"date",label:"Closure date",type:"date",required:true},
  {name:"full_day",label:"Close for the full day",type:"checkbox",value:true,hint:"Clear this option to enter partial closure hours."},
  {name:"start",label:"Partial closure starts",type:"time"}, {name:"end",label:"Partial closure ends",type:"time"},
  {section:"Customer information",sectionHint:"This reason is displayed to customers when they browse availability.",name:"reason",label:"Closure message",required:true,maxLength:500},
]}/>; }
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
