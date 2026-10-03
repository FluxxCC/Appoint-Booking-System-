"use client";
import {Form, type Field} from "@/features/admin/forms";
import Image from "next/image";
import {saveCategory,saveService,saveStaff,assignServices,saveException,removeException} from "./actions";
import {saveImage} from "./image-actions";
import {minorToInput} from "./schemas";
import type {CatalogData,Category,Service,Staff} from "./types";
const flag=(name:string,label:string,value:boolean):Field=>({name,label,type:"checkbox",value});
export function CategoryForm({row}:{row?:Category}){return <Form action={saveCategory} hidden={{id:row?.id??""}} submit={row?"Save category":"Create category"} fields={[
 {name:"name",label:"Name",value:row?.name,required:true},{name:"slug",label:"URL name",value:row?.slug,required:true},
 {name:"sort_order",label:"Display order",type:"number",value:row?.sort_order??0,min:0,max:10000},flag("active","Active",row?.active??true),flag("published","Published",row?.published??false)]}/>;}
export function ServiceForm({data,row}:{data:CatalogData;row?:Service}){
 const currency=data.business?.currency??"PHP";
 return <Form action={saveService} hidden={{id:row?.id??""}} fields={[
 {name:"name",label:"Name",value:row?.name,required:true},{name:"slug",label:"URL name",value:row?.slug,required:true},
 {name:"category_id",label:"Category",value:row?.category_id??"",options:[{value:"",label:"Uncategorized"},...data.categories.map(c=>({value:c.id,label:c.name}))]},
 {name:"description",label:"Description",type:"textarea",value:row?.description??"",maxLength:4000},
 {name:"price",label:`Price (${currency})`,value:minorToInput(row?.price_amount??0,currency),required:true},
 {name:"duration_minutes",label:"Duration (minutes)",type:"number",value:row?.duration_minutes??30,min:1,max:1440,required:true},
 ...["before","after"].map(part=>({name:`buffer_${part}_minutes`,label:`Buffer ${part} (minutes)`,type:"number",value:row?(part==="before"?row.buffer_before_minutes:row.buffer_after_minutes):data.business?.default_buffer_minutes??0,min:0,max:240,required:true})),
 {name:"payment_mode",label:"Payment requirement",value:row?.payment_mode??"PAY_AT_BUSINESS",options:[{value:"PAY_AT_BUSINESS",label:"Pay at business"},{value:"DEPOSIT",label:"Deposit"},{value:"FULL_PAYMENT",label:"Full payment"}]},
 {name:"deposit_type",label:"Deposit calculation",value:row?.deposit_type??"FIXED",options:[{value:"FIXED",label:`Fixed amount (${currency})`},{value:"PERCENTAGE",label:"Percentage"}]},
 {name:"deposit",label:"Deposit amount or percentage",value:row?.deposit_type==="PERCENTAGE"?String((row.deposit_percent_bps??0)/100):minorToInput(row?.deposit_amount??0,currency),hint:"Used only for deposits. Percentages allow two decimals and round up to the smallest currency unit."},
 flag("active","Active (clear to archive)",row?.active??true),flag("published","Published",row?.published??false)
 ]}><p className="text-sm text-muted">Payment is requested only after staff acceptance. Existing appointment prices and durations remain unchanged.</p></Form>;
}
export function StaffForm({row}:{row?:Staff}){return <Form action={saveStaff} hidden={{id:row?.id??""}} fields={[
 {name:"full_name",label:"Full name (private)",value:row?.full_name??row?.display_name,required:true},{name:"display_name",label:"Public display name",value:row?.display_name,required:true},
 {name:"slug",label:"Staff URL name",value:row?.slug,required:true},{name:"bio",label:"Public bio",type:"textarea",value:row?.bio??"",maxLength:2000},
 {name:"email",label:"Contact email (private)",type:"email",value:row?.email??""},{name:"phone",label:"Contact phone (private)",value:row?.phone??""},
 flag("active","Active",row?.active??true),flag("published","Published",row?.published??false),flag("bookable","Publicly bookable",row?.bookable??false)
 ]}><p className="text-sm text-muted">Profiles do not grant account access. Only an owner can invite or link an account.</p></Form>;}
export function AssignmentForm({id,data}:{id:string;data:CatalogData}){return <Form action={assignServices} hidden={{staff_id:id}} fields={[]} submit="Save assignments"><div className="grid gap-3 sm:grid-cols-2">{data.service_options.map(s=><label key={s.id} className="flex gap-3 text-sm"><input type="checkbox" name="services" value={s.id} defaultChecked={data.assigned_services?.includes(s.id)}/>{s.name}{!s.active&&" (inactive)"}</label>)}</div></Form>;}
export function ExceptionForm({id,zone}:{id:string;zone:string}){return <Form action={saveException} hidden={{staff_id:id}} submit="Add exception" fields={[
 {name:"kind",label:"Type",value:"UNAVAILABLE",options:[{value:"UNAVAILABLE",label:"Unavailable / break / leave"},{value:"EXTRA_HOURS",label:"Extra working hours"}]},
 {name:"start",label:`Start (${zone})`,type:"datetime-local",required:true},{name:"end",label:`End (${zone})`,type:"datetime-local",required:true},
 {name:"reason",label:"Reason (internal)",required:true,maxLength:500,hint:"For full-day leave, select midnight through midnight of the following day. Extra hours never open a closed business."}
 ]}/>;}
export function RemoveException({id}:{id:string}){return <Form action={removeException} hidden={{id}} fields={[]} submit="Remove exception"/>;}
export function ImageControl({id,kind,path}:{id:string;kind:"services"|"staff";path:string|null}){const safe=path&&/^(services|staff)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/.test(path);return <div className="space-y-5"><p className="text-sm text-muted">Marketing images are publicly accessible. Upload a still JPEG, PNG or WebP, up to 2 MiB and 16 megapixels.</p>{safe&&<Image unoptimized src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/catalog-images/${path}`} alt="Current marketing image" width={320} height={240} className="max-h-60 rounded-lg object-contain"/>}<Form action={saveImage} fields={[]} hidden={{id,kind,operation:"upload"}} submit={path?"Replace image":"Upload image"}><label className="block text-sm">Image<input required type="file" name="image" accept="image/jpeg,image/png,image/webp" className="mt-2 block w-full"/></label></Form>{path&&<Form action={saveImage} fields={[]} hidden={{id,kind,operation:"remove"}} submit="Remove image"/>}</div>;}
