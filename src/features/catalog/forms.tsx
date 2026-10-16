"use client";
import {useActionState} from "react";
import {Form, type Field} from "@/features/admin/forms";
import Image from "next/image";
import {saveCategory,saveService,saveStaff,assignServices,saveException,removeException} from "./actions";
import {saveImage} from "./image-actions";
import {minorToInput} from "./schemas";
import type {CatalogData,Category,Service,Staff} from "./types";
import type {FormState} from "@/features/auth/schemas";
import {saveBranchServiceAction,saveStaffBranchAssignmentAction,setBranchHomeServiceAction} from "@/features/branches/actions";
const flag=(name:string,label:string,value:boolean,hint?:string,fullWidth?:boolean,showWhen?:Field["showWhen"]):Field=>({name,label,type:"checkbox",value,hint,fullWidth,showWhen});
function ActionFeedback({state}:{state:FormState}){return <>{state.error&&<p role="alert" className="mt-3 rounded-xl bg-danger-soft p-3 text-sm text-danger">{state.error}</p>}{state.success&&<p role="status" className="mt-3 rounded-xl bg-success-soft p-3 text-sm text-success">{state.success}</p>}</>;}
export function CategoryForm({row,sortOrder=0}:{row?:Category;sortOrder?:number}){return <Form action={saveCategory} hidden={{id:row?.id??"",slug:row?.slug??"",sort_order:String(row?.sort_order??sortOrder)}} submit={row?"Save category":"Create category"} fields={[
 {name:"name",label:"Category name",value:row?.name,required:true,maxLength:200},
 flag("active","Active",row?.active??true),flag("published","Visible to customers",row?.published??false)]}>
 <p className="text-sm leading-6 text-muted">The public URL is created from the category name. {row?"Editing the name will not change this category’s existing URL.":"You can rename the category later without changing its URL."}</p>
 </Form>;}
export function ServiceForm({data,row}:{data:CatalogData;row?:Service}){
 const currency=data.business?.currency??"PHP";
 const amountDigits=new Intl.NumberFormat("en",{style:"currency",currency}).resolvedOptions().maximumFractionDigits??2;
 const amountStep=amountDigits===0?"1":`0.${"0".repeat(amountDigits-1)}1`;
 return <Form action={saveService} hidden={{id:row?.id??""}} submit={row?"Save service changes":"Create service"} advancedTitle="Booking and availability options" advancedHint="Payment, locations, time between bookings, and customer visibility." fields={[
 {section:"Service details",sectionHint:"Add the information customers need to choose this service.",name:"name",label:"Service name",value:row?.name,required:true},
 {name:"slug",label:"Service URL name",value:row?.slug,required:true,hint:"Lowercase words separated by hyphens, such as signature-haircut."},
 {name:"category_id",label:"Category",value:row?.category_id??"",options:[{value:"",label:"Uncategorized"},...data.categories.map(c=>({value:c.id,label:c.name}))]},
 {name:"description",label:"Description",type:"textarea",value:row?.description??"",maxLength:4000,hint:"Shown on the public service page."},
 {section:"Price and appointment length",sectionHint:"The appointment length sets how long the customer’s booking occupies the schedule.",name:"duration_minutes",label:"Appointment length (minutes)",type:"number",value:row?.duration_minutes??30,min:1,max:1440,required:true},
 {name:"price",label:`Service price (${currency})`,type:"number",value:minorToInput(row?.price_amount??0,currency),min:0,step:amountStep,required:true},
 ]} advancedFields={[
 {section:"Payment",sectionHint:"Payment is requested only after the booking is accepted.",name:"payment_mode",label:"When should the customer pay?",value:row?.payment_mode??"PAY_AT_BUSINESS",options:[{value:"PAY_AT_BUSINESS",label:"Pay at the business"},{value:"DEPOSIT",label:"Pay a deposit"},{value:"FULL_PAYMENT",label:"Pay in full"}]},
 {name:"deposit_type",label:"Deposit calculation",value:row?.deposit_type??"FIXED",options:[{value:"FIXED",label:`Fixed amount (${currency})`},{value:"PERCENTAGE",label:"Percentage of price"}],showWhen:{name:"payment_mode",value:"DEPOSIT"}},
 {name:"deposit",label:"Deposit amount or percentage",type:"number",value:row?.deposit_type==="PERCENTAGE"?String((row.deposit_percent_bps??0)/100):minorToInput(row?.deposit_amount??0,currency),min:0,step:row?.deposit_type==="PERCENTAGE"?"0.01":amountStep,hint:"For a percentage, enter 0.01–100. For a fixed deposit, enter an amount in the business currency.",showWhen:{name:"payment_mode",value:"DEPOSIT"}},
 {section:"Appointment location",sectionHint:"Choose where customers can receive this service.",...flag("supports_business_location","At the business",row?.supports_business_location??true,"Customers visit your shop or studio.",false)},
 flag("supports_home_service","Home Service",row?.supports_home_service??false,"A staff member visits the customer’s address.",false),
 {section:"Home Service fee and travel time",sectionHint:"These settings appear only when Home Service is enabled. The fee is added to the service price.",name:"home_service_fee",label:`Home Service fee (${currency})`,type:"number",value:minorToInput(row?.home_service_fee??0,currency),min:0,step:amountStep,required:true,showWhen:{name:"supports_home_service",value:true}},
 {name:"home_travel_before_minutes",label:"Travel before (minutes)",type:"number",value:row?.home_travel_before_minutes??0,min:0,max:240,required:true,hint:"Reserved before the appointment starts.",showWhen:{name:"supports_home_service",value:true}},
 {name:"home_travel_after_minutes",label:"Travel after (minutes)",type:"number",value:row?.home_travel_after_minutes??0,min:0,max:240,required:true,hint:"Reserved after the appointment ends.",showWhen:{name:"supports_home_service",value:true}},
 {section:"Time between appointments",sectionHint:"Reserve preparation and cleanup time around each booking.",name:"buffer_before_minutes",label:"Preparation time before (minutes)",type:"number",value:row?.buffer_before_minutes??data.business?.default_buffer_minutes??0,min:0,max:240,required:true},
 {name:"buffer_after_minutes",label:"Cleanup time after (minutes)",type:"number",value:row?.buffer_after_minutes??data.business?.default_buffer_minutes??0,min:0,max:240,required:true},
 {section:"Customer visibility",sectionHint:"Choose whether this service can be booked and listed publicly.",...flag("active","Available for booking",row?.active??true,"Clear this to archive the service.",false)},
 flag("published","Show in public catalog",row?.published??false,"Only published services appear on the customer website.",false)
 ]}><p className="rounded-xl bg-canvas p-4 text-sm leading-6 text-muted">Home Service bookings use the address customers enter when booking. Changes apply to new bookings; existing appointment details stay as booked.</p></Form>;
}
export function BranchHomeServiceControl({branchId,branchName,enabled,isOwner}:{branchId:string;branchName:string;enabled:boolean;isOwner:boolean}){
 const [state,action,pending]=useActionState(setBranchHomeServiceAction,{});
 if(!isOwner)return <div className="rounded-xl border border-line bg-canvas/60 p-4"><p className="font-medium text-ink">Home Service is {enabled?"on":"off"} for {branchName}.</p><p className="mt-1 text-sm text-muted">The owner controls whether customers can request Home Service at this branch.</p></div>;
 return <form action={action} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-canvas/60 p-4">
  <input type="hidden" name="branch_id" value={branchId}/><input type="hidden" name="enabled" value={String(!enabled)}/>
  <div className="min-w-0"><p className="font-semibold text-ink">Customer Home Service requests</p><p className="mt-1 max-w-3xl text-sm leading-6 text-muted">{enabled?`Home Service is available at ${branchName}. Customers provide their own visit destination in each booking.`:`Home Service is off at ${branchName}. Customers cannot select it for new bookings.`}</p><ActionFeedback state={state}/></div>
  <button disabled={pending} className={`min-h-11 shrink-0 rounded-full px-5 font-semibold text-white disabled:opacity-50 ${enabled?"bg-ink":"bg-accent"}`}>{pending?"Saving…":enabled?"Turn off":"Turn on"}</button>
 </form>;
}
export function BranchServiceOfferingForm({branchId,branchName,service,offer,currency,isOwner}:{branchId:string;branchName:string;service:Service;offer?:NonNullable<CatalogData["branch_offerings"]>[number];currency:string;isOwner:boolean}){
 const [state,action,pending]=useActionState(saveBranchServiceAction,{});
 if(!isOwner)return <p className="rounded-xl border border-line bg-canvas/60 p-4 text-sm leading-6 text-muted">This service is {offer?.active?"offered":"not offered"} at {branchName}. The owner manages branch-specific availability and pricing.</p>;
 return <form action={action} className="grid gap-4 rounded-xl border border-line bg-canvas/60 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(150px,220px)_minmax(150px,220px)_auto] sm:items-end">
  <input type="hidden" name="branch_id" value={branchId}/><input type="hidden" name="service_id" value={service.id}/>
  <div className="min-w-0"><p className="font-semibold text-ink">{branchName}</p><p className="mt-1 text-sm text-muted">Set where this service can be booked and its price at this branch.</p></div>
  <label className="text-sm font-medium text-ink">Branch availability<select name="active" defaultValue={String(offer?.active??false)} className="field-control mt-1.5"><option value="false">Not offered</option><option value="true">Offered</option></select></label>
  <label className="text-sm font-medium text-ink">Branch price ({currency})<input name="price_override" type="number" min="0" step="0.01" defaultValue={offer?.price_override==null?"":minorToInput(offer.price_override,currency)} placeholder={`Use ${minorToInput(service.price_amount,currency)} base price`} className="field-control mt-1.5"/><span className="mt-1 block text-xs font-normal text-muted">Leave blank to use the service price.</span></label>
  <button disabled={pending} className="button-secondary min-h-11 px-4 disabled:opacity-50">{pending?"Saving…":"Save branch service"}</button>
  <div className="sm:col-span-4"><ActionFeedback state={state}/></div>
 </form>;
}
export function StaffBranchAssignmentControl({branchId,branchName,staffId,active,isOwner}:{branchId:string;branchName:string;staffId:string;active:boolean;isOwner:boolean}){
 const [state,action,pending]=useActionState(saveStaffBranchAssignmentAction,{});
 if(!isOwner)return <p className="rounded-xl border border-line bg-canvas/60 p-4 text-sm text-muted">This profile is {active?"assigned":"not assigned"} to {branchName}. Ask the owner to change branch eligibility.</p>;
 return <form action={action} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-canvas/60 p-4">
  <input type="hidden" name="branch_id" value={branchId}/><input type="hidden" name="target_id" value={staffId}/><input type="hidden" name="active" value={String(!active)}/>
  <div><p className="font-medium text-ink">{branchName}</p><p className="mt-1 text-sm text-muted">{active?"This staff member can be assigned to appointments at this branch.":"This staff member is not eligible for appointments at this branch."}</p><ActionFeedback state={state}/></div>
  <button disabled={pending} className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50 ${active?"border-danger/30 text-danger hover:bg-danger-soft":"border-line text-accent-dark hover:bg-accent-soft"}`}>{pending?"Saving…":active?"Remove from branch":"Assign to branch"}</button>
 </form>;
}
export function StaffForm({row}:{row?:Staff}){return <Form action={saveStaff} hidden={{id:row?.id??"",slug:row?.slug??""}} fields={[
 {section:"Staff details",sectionHint:"Keep private account details separate from the public profile.",name:"full_name",label:"Full name (private)",value:row?.full_name??row?.display_name,required:true},
 {name:"display_name",label:"Public display name",value:row?.display_name,required:true},
 {name:"bio",label:"Public bio",type:"textarea",value:row?.bio??"",maxLength:2000},
 {name:"email",label:"Contact email (private)",type:"email",value:row?.email??""},
 {name:"phone",label:"Contact phone (private)",type:"tel",value:row?.phone??""},
 {section:"Booking and visibility",sectionHint:"These settings control whether the profile is active and available to customers.",...flag("active","Active",row?.active??true)},
 flag("published","Published",row?.published??false),
 flag("bookable","Publicly bookable",row?.bookable??false)
 ]}><p className="rounded-xl bg-canvas p-4 text-sm leading-6 text-muted">Public profile links are created automatically. Profiles do not grant account access; only an owner can invite or link a staff account.</p></Form>;}
export function AssignmentForm({id,data}:{id:string;data:CatalogData}){return <Form action={assignServices} hidden={{staff_id:id}} fields={[]} submit="Save assignments"><div><p className="mb-4 text-sm leading-6 text-muted">Select the services this professional is trained to provide.</p><div className="grid gap-3 sm:grid-cols-2">{data.service_options.map(s=><label key={s.id} className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border border-line bg-canvas/50 p-4 text-sm transition hover:border-accent/40 hover:bg-accent-soft/40"><input type="checkbox" name="services" value={s.id} defaultChecked={data.assigned_services?.includes(s.id)} className="mt-0.5 size-5 shrink-0 accent-accent"/><span className="font-medium text-ink">{s.name}{!s.active&&<span className="ml-1 font-normal text-muted">(inactive)</span>}</span></label>)}</div></div></Form>;}
export function ExceptionForm({id,zone}:{id:string;zone:string}){return <Form action={saveException} hidden={{staff_id:id}} submit="Add exception" fields={[
 {section:"Schedule exception",sectionHint:"Times are interpreted in the business timezone.",name:"kind",label:"Type",value:"UNAVAILABLE",options:[{value:"UNAVAILABLE",label:"Unavailable / break / leave"},{value:"EXTRA_HOURS",label:"Extra working hours"}]},
 {name:"start",label:`Start (${zone})`,type:"datetime-local",required:true},{name:"end",label:`End (${zone})`,type:"datetime-local",required:true},
 {name:"reason",label:"Reason (internal)",required:true,maxLength:500,hint:"For full-day leave, use midnight through midnight of the following day. Extra hours never open a closed business."}
 ]}/>;}
export function RemoveException({id}:{id:string}){return <Form action={removeException} hidden={{id}} fields={[]} submit="Remove exception"/>;}
export function ImageControl({id,kind,path}:{id:string;kind:"services"|"staff";path:string|null}){const safe=path&&/^(services|staff)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/.test(path);return <div className="space-y-5"><p className="text-sm text-muted">Marketing images are publicly accessible. Upload a still JPEG, PNG or WebP, up to 2 MiB and 16 megapixels.</p>{safe&&<Image unoptimized src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/catalog-images/${path}`} alt="Current marketing image" width={320} height={240} className="max-h-60 rounded-lg object-contain"/>}<Form action={saveImage} fields={[]} hidden={{id,kind,operation:"upload"}} submit={path?"Replace image":"Upload image"}><label className="block text-sm">Image<input required type="file" name="image" accept="image/jpeg,image/png,image/webp" className="mt-2 block w-full"/></label></Form>{path&&<Form action={saveImage} fields={[]} hidden={{id,kind,operation:"remove"}} submit="Remove image"/>}</div>;}
