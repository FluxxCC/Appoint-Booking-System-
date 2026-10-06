"use server";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {requireArea} from "@/lib/auth/access.server";
import type {FormState} from "@/features/auth/schemas";
import {hoursSchema} from "@/features/admin/schemas";
import {categorySchema,serviceSchema,serviceValues,staffSchema,exceptionSchema} from "./schemas";
const text=(f:FormData,k:string)=>f.get(k)??"";
function values(f:FormData,keys:string[],flags:string[]=[]){return {...Object.fromEntries(keys.map(k=>[k,text(f,k)])),...Object.fromEntries(flags.map(k=>[k,f.get(k)==="on"]))};}
function staffSlug(value:string){return value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,100).replace(/-+$/g,"")||"staff";}
function categorySlug(value:string){return value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,100).replace(/-+$/g,"")||"category";}
function revalidatePublicCatalog(){
 revalidatePath("/","page");
 revalidatePath("/services","page");
 revalidatePath("/services/[slug]","page");
 revalidatePath("/book","page");
}
function invalid(e:z.ZodError):FormState{return {error:e.issues.map(i=>`${i.path.join(".")}: ${i.message}`).join(" ")};}
export async function saveCategory(_s:FormState,f:FormData):Promise<FormState>{
 const {supabase}=await requireArea("admin");const v=categorySchema.safeParse(values(f,["id","name","slug","sort_order"],["active","published"]));if(!v.success)return invalid(v.error);
 const pId=v.data.id||null;const categoryValues={...v.data,slug:v.data.slug||categorySlug(v.data.name)};
 let {error}=await supabase.rpc("catalog_save_category",{p_id:pId,p_values:categoryValues});
 if(error?.code==="23505"&&!pId){categoryValues.slug=`${categorySlug(v.data.name).slice(0,90)}-${randomUUID().slice(0,8)}`;({error}=await supabase.rpc("catalog_save_category",{p_id:null,p_values:categoryValues}));}
 if(error)return {error:"Unable to save category. Check the category details and try again."};
 revalidatePath("/admin/services","layout");revalidatePublicCatalog();return {success:"Category saved."};
}
export async function reorderCategories(categoryIds:string[]):Promise<FormState>{
 const ids=z.array(z.uuid()).min(1).max(500).safeParse(categoryIds);if(!ids.success)return invalid(ids.error);
 const {supabase}=await requireArea("admin");
 const {error}=await supabase.rpc("catalog_reorder_categories",{p_category_ids:ids.data});
 if(error)return {error:"Category order could not be saved. Reload and try again."};
 revalidatePath("/admin/services/categories","page");revalidatePublicCatalog();
 return {success:"Category order saved."};
}
export async function saveService(_s:FormState,f:FormData):Promise<FormState>{
 const {supabase}=await requireArea("admin");const v=serviceSchema.safeParse(values(f,["id","name","slug","category_id","description","price","duration_minutes","buffer_before_minutes","buffer_after_minutes","payment_mode","deposit_type","deposit","home_service_fee","home_travel_before_minutes","home_travel_after_minutes"],["supports_business_location","supports_home_service","active","published"]));if(!v.success)return invalid(v.error);
 const {data:business,error:businessError}=await supabase.from("business_settings").select("currency").single();if(businessError||!business)return {error:"Save business settings before creating services."};
 let fields;try{fields=serviceValues(v.data,business.currency);}catch(e){return {error:e instanceof Error?e.message:"Invalid price or deposit."};}
 const {data,error}=await supabase.rpc("catalog_save_service",{p_id:v.data.id||null,p_values:fields,p_currency:business.currency});if(error)return {error:"Unable to save service. Check its unique slug, category and payment settings."};
 revalidatePath("/admin","layout");revalidatePublicCatalog();if(!v.data.id)redirect(`/admin/services/${data}`);return {success:"Service saved. Public service pages are refreshed; existing appointment snapshots are unchanged."};
}
export async function saveStaff(_s:FormState,f:FormData):Promise<FormState>{
 const {supabase}=await requireArea("admin");const v=staffSchema.safeParse(values(f,["id","full_name","display_name","slug","bio","email","phone"],["active","published","bookable"]));if(!v.success)return invalid(v.error);
 const pId=v.data.id||null;const staffValues={...v.data,slug:v.data.slug||staffSlug(v.data.display_name)};
 let {data,error}=await supabase.rpc("catalog_save_staff",{p_id:pId,p_values:staffValues});
 if(error?.code==="23505"&&!pId){staffValues.slug=`${staffSlug(v.data.display_name).slice(0,90)}-${randomUUID().slice(0,8)}`;({data,error}=await supabase.rpc("catalog_save_staff",{p_id:null,p_values:staffValues}));}
 if(error)return {error:"Unable to save staff. Check the profile fields and try again."};
 revalidatePath("/admin","layout");if(!v.data.id)redirect(`/admin/staff/${data}`);return {success:"Staff profile saved. Account roles are unchanged."};
}
export async function assignServices(_s:FormState,f:FormData):Promise<FormState>{
 const {supabase}=await requireArea("admin");const v=z.object({staff:z.uuid(),services:z.array(z.uuid()).max(1000)}).safeParse({staff:f.get("staff_id"),services:f.getAll("services")});if(!v.success)return invalid(v.error);
 const {error}=await supabase.rpc("catalog_assign_services",{p_staff:v.data.staff,p_services:[...new Set(v.data.services)]});if(error)return {error:"Assignments could not be saved. Reload and try again."};revalidatePath("/admin","layout");return {success:"Service assignments saved."};
}
export async function saveStaffHours(_s:FormState,f:FormData):Promise<FormState>{
 const {supabase}=await requireArea("admin");const id=z.uuid().safeParse(f.get("staff_id"));if(!id.success)return {error:"Invalid staff."};
 let rows;try{const raw=f.get("intervals");if(typeof raw!=="string"||raw.length>10000)throw Error();rows=JSON.parse(raw);}catch{return {error:"Invalid hours."};}
 const v=hoursSchema.safeParse(rows);if(!v.success)return invalid(v.error);
 const {error}=await supabase.rpc("catalog_save_staff_hours",{p_staff:id.data,p_intervals:v.data});if(error)return {error:"Hours could not be saved. Intervals must not overlap or invalidate active appointments."};revalidatePath("/admin","layout");revalidatePath("/staff","layout");return {success:"Staff hours saved."};
}
export async function saveException(_s:FormState,f:FormData):Promise<FormState>{
 const {supabase}=await requireArea("admin");const v=exceptionSchema.safeParse(values(f,["staff_id","kind","start","end","reason"]));if(!v.success)return invalid(v.error);
 const {error}=await supabase.rpc("catalog_save_exception",{p_staff:v.data.staff_id,p_kind:v.data.kind,p_start:v.data.start,p_end:v.data.end,p_reason:v.data.reason});if(error)return {error:"Exception could not be saved. Check local times (including daylight saving) and active appointments."};revalidatePath("/admin","layout");revalidatePath("/staff","layout");return {success:"Schedule exception saved."};
}
export async function removeException(_s:FormState,f:FormData):Promise<FormState>{
 const {supabase}=await requireArea("admin");const id=z.uuid().safeParse(f.get("id"));if(!id.success)return {error:"Invalid exception."};
 const {data,error}=await supabase.from("staff_schedule_exceptions").delete().eq("id",id.data).select("id");if(error||!data?.length)return {error:"Could not remove the exception. Removing extra hours must not invalidate an appointment."};
 revalidatePath("/admin","layout");revalidatePath("/staff","layout");return {success:"Exception removed."};
}
