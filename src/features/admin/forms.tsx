"use client";
import { useActionState, useId, useState } from "react";
import type { FormState } from "@/features/auth/schemas";
import type { AdminData } from "./types";
import { saveSettings,saveApprovalMode,saveHours,saveClosure,saveAnnouncement,deleteClosure,deleteAnnouncement } from "./actions";
import { localInput } from "./format";

const input="field-control text-sm";
const button="button-primary disabled:cursor-not-allowed disabled:opacity-50";
export type Field={name:string;label:string;value?:string|number|boolean;type?:string;hint?:string;required?:boolean;min?:number;max?:number;maxLength?:number;options?:{value:string;label:string}[]};
function Feedback({state}:{state:FormState}) { return <>{state.error&&<p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{state.error}</p>}{state.success&&<p role="status" className="rounded-lg bg-accent-soft p-3 text-sm text-accent-dark">{state.success}</p>}</>; }
function Fields({fields}:{fields:Field[]}) {
  const prefix=useId();
  return <div className="grid gap-5 sm:grid-cols-2">{fields.map(f=>{
    const id=`${prefix}-${f.name}`;
    return <div key={f.name} className={f.type==="textarea"?"sm:col-span-2":""}><label htmlFor={id} className="mb-1.5 block text-sm font-medium">{f.label}</label>
    {f.options?<select id={id} name={f.name} defaultValue={String(f.value??"")} required={f.required} className={input}>{f.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:f.type==="checkbox"?<input id={id} name={f.name} type="checkbox" defaultChecked={Boolean(f.value)} className="size-5 accent-accent" aria-describedby={f.hint?`${id}-hint`:undefined}/>:f.type==="textarea"?<textarea id={id} name={f.name} defaultValue={String(f.value??"")} rows={4} maxLength={f.maxLength} required={f.required} className={input} aria-describedby={f.hint?`${id}-hint`:undefined}/>:<input id={id} name={f.name} type={f.type??"text"} defaultValue={String(f.value??"")} required={f.required} min={f.min} max={f.max} maxLength={f.maxLength} className={input} aria-describedby={f.hint?`${id}-hint`:undefined}/>}
    {f.hint&&<p id={`${id}-hint`} className="mt-1 text-xs leading-5 text-muted">{f.hint}</p>}</div>;
  })}</div>;
}
export function Form({action,fields,hidden={},submit="Save changes",children}:{action:(s:FormState,f:FormData)=>Promise<FormState>;fields:Field[];hidden?:Record<string,string>;submit?:string;children?:React.ReactNode}) {
  const [state,dispatch,pending]=useActionState(action,{});
  return <form action={dispatch} className="space-y-5">{Object.entries(hidden).map(([name,value])=><input key={name} type="hidden" name={name} value={value}/>)}<fieldset disabled={pending} className="space-y-5"><Fields fields={fields}/>{children}<button className={button} disabled={pending}>{pending?"Saving…":submit}</button></fieldset><Feedback state={state}/></form>;
}
export function SettingsForm({data}:{data:AdminData}) {
  const b=data.business, p=data.policy;
  return <Form action={saveSettings} hidden={{expected_updated_at:data.expected_updated_at??""}} fields={[
    {name:"name",label:"Business name",value:b?.name,required:true,maxLength:200},
    {name:"contact_email",label:"Business email",type:"email",value:b?.contact_email??"",maxLength:254},
    {name:"contact_phone",label:"Phone number",type:"tel",value:b?.contact_phone??"",maxLength:40},
    {name:"address",label:"Address",value:b?.address??"",maxLength:1000},
    {name:"description",label:"Business description",type:"textarea",value:b?.description,maxLength:4000},
    {name:"timezone",label:"IANA timezone",value:b?.timezone??"Asia/Manila",required:true,hint:"Example: Asia/Manila. Locked once appointments exist."},
    {name:"currency",label:"Currency",value:b?.currency??"PHP",required:true,hint:"ISO code, such as PHP, USD or EUR. Locked once appointments exist."},
    {name:"scheduling_interval_minutes",label:"Scheduling interval (minutes)",type:"number",value:b?.scheduling_interval_minutes??15,min:5,max:120,required:true,hint:"Default for the future booking slot picker."},
    {name:"default_buffer_minutes",label:"Default buffer (minutes)",type:"number",value:b?.default_buffer_minutes??0,min:0,max:240,required:true,hint:"Default for future service creation. Existing service buffers and appointment snapshots remain authoritative."},
    {name:"minimum_notice_minutes",label:"Minimum booking lead time (minutes)",type:"number",value:p?.minimum_notice_minutes??60,min:0,max:1051200,required:true},
    {name:"maximum_advance_days",label:"Advance booking window (days)",type:"number",value:p?.maximum_advance_days??90,min:1,max:730,required:true},
    {name:"payment_window_minutes",label:"Payment deadline after acceptance (minutes)",type:"number",value:p?.payment_window_minutes??30,min:1,max:1440,required:true},
    {name:"guest_booking_enabled",label:"Enable future guest booking",type:"checkbox",value:b?.guest_booking_enabled??true},
    {name:"customer_registration_enabled",label:"Enable customer registration",type:"checkbox",value:b?.customer_registration_enabled??true,hint:"Disabling blocks new self-registration. Existing accounts and owner-issued staff invitations remain available."},
    {name:"terms",label:"Booking policy terms",type:"textarea",value:p?.terms??"",maxLength:10000,required:true,hint:"Saving changed booking rules publishes a new policy version. Existing requests retain their original policy."},
    {name:"refund_policy",label:"Refund policy",type:"textarea",value:b?.refund_policy??"",maxLength:10000,required:true,hint:"This text appears on the public refund policy page. Review and edit it for your business before publishing."},
  ]}><p className="rounded-lg bg-canvas p-3 text-sm text-muted">Payment is required only after a request reserves its slot. Changing booking rules publishes a new policy version; the refund policy is saved with business settings and shown publicly.</p></Form>;
}
export function ApprovalModeForm({mode}:{mode:string}) {
  return <Form action={saveApprovalMode} submit="Save approval mode" fields={[{name:"mode",label:"How requests are approved",value:mode,required:true,options:[
    {value:"ADMIN_APPROVAL",label:"Owner or administrator reviews requests"},
    {value:"STAFF_APPROVAL",label:"Assigned staff reviews requests; owner and administrator can help"},
    {value:"AUTO_CONFIRM",label:"Reserve an available slot as soon as a request is submitted"},
  ]}]}/>;
}
type Interval={weekday:number;opens_at:string;closes_at:string};
export function HoursForm({rows,action=saveHours,hidden={}}:{rows:{weekday:number;opens_at:string;closes_at:string}[];action?:(s:FormState,f:FormData)=>Promise<FormState>;hidden?:Record<string,string>}) {
  const [hours,setHours]=useState<Interval[]>(rows.map(r=>({weekday:r.weekday,opens_at:r.opens_at.slice(0,5),closes_at:r.closes_at.slice(0,5)})));
  const [state,dispatch,pending]=useActionState(action,{});
  const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  return <form action={dispatch} className="space-y-5">{Object.entries(hidden).map(([name,value])=><input type="hidden" key={name} name={name} value={value}/>)}<input type="hidden" name="intervals" value={JSON.stringify(hours)}/><p className="text-sm text-muted">Hours use the business timezone. A day with no intervals is closed. Overnight intervals are not supported.</p><fieldset disabled={pending} className="space-y-4">{days.map((day,weekday)=><div key={day} className="rounded-lg border border-line p-4"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{day}</h3><button type="button" className="text-sm font-medium text-accent-dark" disabled={hours.filter(h=>h.weekday===weekday).length>=4} onClick={()=>setHours([...hours,{weekday,opens_at:"09:00",closes_at:"18:00"}])}>Add interval</button></div>{!hours.some(h=>h.weekday===weekday)&&<p className="text-sm text-muted">Closed</p>}{hours.map((h,i)=>h.weekday===weekday&&<div key={i} className="mb-3 flex flex-wrap items-end gap-3"><label className="text-xs">Opens<input aria-label={`${day} interval ${i+1} opening time`} type="time" required value={h.opens_at} className={input} onChange={e=>setHours(hours.map((row,index)=>index===i?{...row,opens_at:e.target.value}:row))}/></label><label className="text-xs">Closes<input aria-label={`${day} interval ${i+1} closing time`} type="time" required value={h.closes_at} className={input} onChange={e=>setHours(hours.map((row,index)=>index===i?{...row,closes_at:e.target.value}:row))}/></label><button type="button" className="px-2 py-2 text-sm text-danger" onClick={()=>setHours(hours.filter((_,index)=>index!==i))}>Remove interval</button></div>)}</div>)}<button className={button} disabled={pending}>{pending?"Saving…":"Save weekly hours"}</button></fieldset><Feedback state={state}/></form>;
}
export function ClosureForm() { return <Form action={saveClosure} submit="Create closure" fields={[
  {name:"date",label:"Closure date",type:"date",required:true}, {name:"full_day",label:"Full-day closure",type:"checkbox",value:true,hint:"Clear this for a partial closure."},
  {name:"start",label:"Partial closure starts",type:"time"}, {name:"end",label:"Partial closure ends",type:"time"},
  {name:"reason",label:"Public reason",required:true,maxLength:500,hint:"Visible to customers. Avoid private staff details."},
]}/>; }
export function AnnouncementForm({row,zone}:{row?:NonNullable<AdminData["announcements"]>[number];zone:string}) { return <Form action={saveAnnouncement} hidden={{id:row?.id??""}} submit={row?"Save announcement":"Create announcement"} fields={[
  {name:"title",label:"Title",value:row?.title,required:true,maxLength:200}, {name:"published",label:"Published",type:"checkbox",value:row?.published??false},
  {name:"body",label:"Message",type:"textarea",value:row?.body,required:true,maxLength:10000},
  {name:"start",label:`Display start (${zone})`,type:"datetime-local",value:row?localInput(row.starts_at,zone):"",hint:"Leave blank to start now."},
  {name:"end",label:`Display end (${zone})`,type:"datetime-local",value:row?.ends_at?localInput(row.ends_at,zone):"",hint:"Leave blank for no end date."},
]}/>; }
export function DeleteForm({id,kind}:{id:string;kind:"closure"|"announcement"}) {
  const [state,dispatch,pending]=useActionState(kind==="closure"?deleteClosure:deleteAnnouncement,{});
  return <form action={dispatch} onSubmit={e=>{if(!window.confirm(`Permanently delete this ${kind}? ${kind==="closure"?"The affected time will reopen for scheduling.":"It will no longer be displayed."}`)) e.preventDefault();}} className="mt-4 space-y-3"><input type="hidden" name="id" value={id}/><button disabled={pending} className="rounded-lg border border-danger/30 px-3 py-2 text-sm text-danger disabled:opacity-50">{pending?"Deleting…":`Delete ${kind}`}</button><Feedback state={state}/></form>;
}
