import "server-only";
import {requireArea} from "@/lib/auth/access.server";
import {createClient} from "@/lib/supabase/server";
import {catalogFilters} from "./schemas";
import type {SearchParams} from "@/features/admin/data.server";
import type {CatalogData,StaffWorkspace} from "./types";
export async function readCatalog(kind:"services"|"staff",search:SearchParams={},id?:string){
 const {supabase,principal}=await requireArea("admin");const f=catalogFilters.parse({q:search.q,category:search.category,active:search.active,page:search.page});
 const {data,error}=await supabase.rpc("catalog_data",{p_kind:kind,p_id:id,p_query:f.q,p_category:f.category||null,p_active:f.active,p_page:f.page});
 if(error||!data)throw new Error("Catalog could not be loaded. Check the database migration and retry.");
 return {data:data as unknown as CatalogData,filters:f,principal};
}
export async function readStaffWorkspace(){
 const {supabase}=await requireArea("staff");const [{data,error},{data:business,error:businessError}]=await Promise.all([
  supabase.rpc("my_staff_workspace"),supabase.from("business_settings").select("booking_approval_mode").maybeSingle(),
 ]);
 if(error||!data||businessError)throw new Error("Your staff workspace could not be loaded.");
 return {...data as object,approval_mode:business?.booking_approval_mode??"ADMIN_APPROVAL"} as StaffWorkspace;
}
/** Future public pages use this explicit safe projection, not select('*') on staff. */
export async function readPublicCatalog(){
 const supabase=await createClient();const {data,error}=await supabase.rpc("public_catalog");
 if(error||!data)throw new Error("The public catalog could not be loaded.");return data;
}
