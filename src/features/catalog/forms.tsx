"use client";
import {Form, type Field} from "@/features/admin/forms";
import Image from "next/image";
import {saveCategory,saveService,saveStaff,assignServices,saveException,removeException} from "./actions";
import {saveImage} from "./image-actions";
import {minorToInput} from "./schemas";
import type {CatalogData,Category,Service,Staff} from "./types";
const flag=(name:string,label:string,value:boolean):Field=>({name,label,type:"checkbox",value});
export function CategoryForm({row,sortOrder=0}:{row?:Category;sortOrder?:number}){return <Form action={saveCategory} hidden={{id:row?.id??"",slug:row?.slug??"",sort_order:String(row?.sort_order??sortOrder)}} submit={row?"Save category":"Create category"} fields={[
 {name:"name",label:"Category name",value:row?.name,required:true,maxLength:200},
 flag("active","Active",row?.active??true),flag("published","Visible to customers",row?.published??false)]}>
 <p className="text-sm leading-6 text-muted">The public URL is created from the category name. {row?"Editing the name will not change this category’s existing URL.":"You can rename the category later without changing its URL."}</p>
 </Form>;}
export function ServiceForm({data,row}:{data:CatalogData;row?:Service}){
 const currency=data.business?.currency??"PHP";
 return <Form action={saveService} hidden={{id:row?.id??""}} fields={[
 {section:"Service details",sectionHint:"How this service appears in the customer catalog.",name:"name",label:"Service name",value:row?.name,required:true},
 {name:"slug",label:"URL name",value:row?.slug,required:true},
 {name:"category_id",label:"Category",value:row?.category_id??"",options:[{value:"",label:"Uncategorized"},...data.categories.map(c=>({value:c.id,label:c.name}))]},
 {name:"description",label:"Description",type:"textarea",value:row?.description??"",maxLength:4000},
 {section:"Appointment time and price",sectionHint:"The booking time includes the service duration and its buffers.",name:"duration_minutes",label:"Service duration (minutes)",type:"number",value:row?.duration_minutes??30,min:1,max:1440,required:true},
 {name:"price",label:`Price (${currency})`,value:minorToInput(row?.price_amount??0,currency),required:true},
 {name:"buffer_before_minutes",label:"Buffer before (minutes)",type:"number",value:row?.buffer_before_minutes??data.business?.default_buffer_minutes??0,min:0,max:240,required:true,hint:"Preparation time reserved before the customer’s appointment."},
 {name:"buffer_after_minutes",label:"Buffer after (minutes)",type:"number",value:row?.buffer_after_minutes??data.business?.default_buffer_minutes??0,min:0,max:240,required:true,hint:"Cleanup or transition time reserved after the appointment."},
 {section:"Payment",sectionHint:"Payment is requested only after the booking is accepted.",name:"payment_mode",label:"Payment requirement",value:row?.payment_mode??"PAY_AT_BUSINESS",options:[{value:"PAY_AT_BUSINESS",label:"Pay at business"},{value:"DEPOSIT",label:"Deposit"},{value:"FULL_PAYMENT",label:"Full payment"}]},
 {name:"deposit_type",label:"Deposit calculation",value:row?.deposit_type??"FIXED",options:[{value:"FIXED",label:`Fixed amount (${currency})`},{value:"PERCENTAGE",label:"Percentage"}]},
 {name:"deposit",label:"Deposit amount or percentage",value:row?.deposit_type==="PERCENTAGE"?String((row.deposit_percent_bps??0)/100):minorToInput(row?.deposit_amount??0,currency),hint:"Used only for deposits. Percentages allow two decimals and round up to the smallest currency unit."},
 {section:"Appointment location",sectionHint:"Customers can choose from the locations enabled for this service.",...flag("supports_business_location","At business",row?.supports_business_location??true)},
 flag("supports_home_service","Home Service",row?.supports_home_service??false),
 {section:"Home Service settings",sectionHint:"The fee is added to the service price. Travel time is reserved around the appointment.",name:"home_service_fee",label:`Home Service fee (${currency})`,value:minorToInput(row?.home_service_fee??0,currency),required:true},
 {name:"home_travel_before_minutes",label:"Travel time before appointment (minutes)",type:"number",value:row?.home_travel_before_minutes??0,min:0,max:240,required:true},
 {name:"home_travel_after_minutes",label:"Travel time after appointment (minutes)",type:"number",value:row?.home_travel_after_minutes??0,min:0,max:240,required:true},
 {section:"Availability and visibility",sectionHint:"Control whether this service can be booked and displayed publicly.",...flag("active","Active (clear to archive)",row?.active??true)},
 flag("published","Published",row?.published??false)
 ]}><p className="rounded-xl bg-canvas p-4 text-sm leading-6 text-muted">Existing appointment prices, locations and travel buffers remain unchanged when you edit this service. Home Service bookings require a registered customer account.</p></Form>;
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
