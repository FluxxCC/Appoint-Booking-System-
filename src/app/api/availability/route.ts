import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {createPrivilegedClient} from "@/lib/supabase/privileged.server";
import {readVerifiedUser} from "@/lib/auth/require-user.server";
import {requireArea} from "@/lib/auth/access.server";
import {availabilityInput} from "@/features/availability/schemas";
import {consumeRateLimit,trustedClientIdentifier} from "@/features/availability/rate-limit.server";
export const dynamic="force-dynamic";
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store, max-age=0","Vary":"Cookie"}});
export async function GET(request:Request){
 const url=new URL(request.url),fulfillment=url.searchParams.get("fulfillment")??"BUSINESS_LOCATION";
 if(fulfillment!=="BUSINESS_LOCATION"&&fulfillment!=="HOME_SERVICE")return json({error:"Provide a valid appointment location."},400);
 const input=availabilityInput.safeParse(Object.fromEntries(url.searchParams));
 if(!input.success)return json({error:"Provide a valid service and business-local date."},400);
 const decision=await consumeRateLimit("availability",trustedClientIdentifier(request.headers));
 if(!decision.allowed){const status=decision.unavailable?503:429;return NextResponse.json({error:decision.unavailable?"Availability is temporarily unavailable. Please try again shortly.":"Too many requests. Please wait a moment and try again."},{status,headers:{"Cache-Control":"no-store, max-age=0","Vary":"Cookie","Retry-After":String(decision.retryAfterSeconds)}})}
 if(input.data.diagnostics){try{await requireArea("admin");}catch{return json({error:"Admin access with MFA is required for diagnostics."},403);}}
 let supabase;
 try { supabase=input.data.diagnostics?await createClient():createPrivilegedClient(); }
 catch { return json({error:"Availability is temporarily unavailable. Please check the server configuration."},503); }
 const {user}=input.data.diagnostics?{user:null}:await readVerifiedUser();
 const {data,error}=input.data.diagnostics
  ?await supabase.rpc("admin_availability_for_date",{p_service:input.data.service,p_date:input.data.date,p_staff:input.data.staff||null})
  :fulfillment==="HOME_SERVICE"
  ?await supabase.rpc("server_home_service_availability_for_date",{p_service:input.data.service,p_date:input.data.date,p_staff:input.data.staff||null,p_auth_user:user?.id??null})
  :await supabase.rpc("server_availability_for_date",{p_service:input.data.service,p_date:input.data.date,p_staff:input.data.staff||null,p_auth_user:user?.id??null});
 if(error||!data)return json({error:"Availability could not be loaded."},503);
 return json(data);
}
