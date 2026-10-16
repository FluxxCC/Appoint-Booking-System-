import "server-only";
import {cache} from "react";
import {createClient} from "@/lib/supabase/server";
import {resolveWorkspaceBranchContext} from "@/features/branches/workspace-context.server";
import {catalogFilters} from "./schemas";
import type {SearchParams} from "@/features/admin/data.server";
import type {CatalogData,StaffWorkspace} from "./types";
export async function readCatalog(kind:"services"|"staff",search:SearchParams={},id?:string){
 const {supabase,principal,branchContext}=await resolveWorkspaceBranchContext("admin");
 const f=catalogFilters.parse({q:search.q,category:search.category,active:search.active,page:search.page});
 const branchId=branchContext.selectedBranchId;
 const [{data,error},branchSettingsResult,staffAssignmentResult]=await Promise.all([
  supabase.rpc("catalog_data_for_branch",{p_kind:kind,p_branch_id:branchId,p_id:id??null,p_query:f.q,p_category:f.category||null,p_active:f.active,p_page:f.page}),
  branchId?supabase.from("branches").select("home_service_enabled").eq("id",branchId).maybeSingle():Promise.resolve({data:null,error:null}),
  branchId&&kind==="staff"&&id?supabase.from("staff_branch_assignments").select("active").eq("branch_id",branchId).eq("staff_id",id).maybeSingle():Promise.resolve({data:null,error:null}),
 ]);
 if(error||!data)throw new Error("Catalog could not be loaded. Check the database migration and retry.");
 if(branchSettingsResult.error||staffAssignmentResult.error)throw new Error("Branch catalog settings could not be loaded. Refresh and try again.");
 return {data:{...(data as unknown as CatalogData),branch_home_service_enabled:branchSettingsResult.data?.home_service_enabled??false,branch_assignment_active:staffAssignmentResult.data?.active??false},filters:f,principal,branchContext};
}
async function readStaffWorkspaceUncached(){
 const {supabase,branchContext}=await resolveWorkspaceBranchContext("staff");const [{data,error},{data:business,error:businessError}]=await Promise.all([
  supabase.rpc("my_staff_workspace_for_branch",{p_branch_id:branchContext.selectedBranchId}),supabase.from("business_settings").select("booking_approval_mode").maybeSingle(),
 ]);
 if(error||!data||businessError)throw new Error("Your staff workspace could not be loaded.");
 const workspace=data as StaffWorkspace;
 const rows=[...workspace.today,...workspace.pending,...workspace.confirmed,...workspace.upcoming];
 const ids=[...new Set(rows.map(row=>row.id))];
 if(ids.length){
  const [{data:appointments,error:appointmentError},{data:locations,error:locationError}]=await Promise.all([
   supabase.from("appointments").select("id,fulfillment_mode,service_area_hint").in("id",ids),
   supabase.from("appointment_home_locations").select("appointment_id,address,latitude,longitude,landmark,instructions").in("appointment_id",ids),
  ]);
  if(appointmentError||locationError)throw new Error("Your appointment destination details could not be loaded.");
  const apptMap=new Map((appointments??[]).map(row=>[row.id,row]));
  const locMap=new Map((locations??[]).map(row=>[row.appointment_id,{address:row.address,latitude:Number(row.latitude),longitude:Number(row.longitude),landmark:row.landmark,instructions:row.instructions}]));
  const add=(row:typeof rows[number])=>({...row,fulfillment_mode:apptMap.get(row.id)?.fulfillment_mode,service_area_hint:apptMap.get(row.id)?.service_area_hint,home_location:locMap.get(row.id)??null});
  workspace.today=workspace.today.map(add);workspace.pending=workspace.pending.map(add);workspace.confirmed=workspace.confirmed.map(add);workspace.upcoming=workspace.upcoming.map(add);
 }
 return {...workspace,approval_mode:business?.booking_approval_mode??"ADMIN_APPROVAL",branchContext};
}
export const readStaffWorkspace=cache(readStaffWorkspaceUncached);
/** Future public pages use this explicit safe projection, not select('*') on staff. */
export async function readPublicCatalog(){
 const supabase=await createClient();const {data,error}=await supabase.rpc("public_catalog");
 if(error||!data)throw new Error("The public catalog could not be loaded.");return data;
}
