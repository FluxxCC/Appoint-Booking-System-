"use server";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {requireArea} from "@/lib/auth/access.server";
import type {FormState} from "@/features/auth/schemas";
import {prepareImage} from "./images.server";
export async function saveImage(_state:FormState,form:FormData):Promise<FormState>{
 const {supabase}=await requireArea("admin");
 const input=z.object({id:z.uuid(),kind:z.enum(["services","staff"]),operation:z.enum(["upload","remove"])}).safeParse(Object.fromEntries(["id","kind","operation"].map(k=>[k,form.get(k)])));
 if(!input.success)return {error:"Invalid image target."};
 const {id,kind,operation}=input.data;
 const column=kind==="services"?"image_path":"photo_path";
 const result=kind==="services"?await supabase.from("services").select("image_path").eq("id",id).single():await supabase.from("staff").select("photo_path").eq("id",id).single();
 if(result.error||!result.data)return {error:"Record unavailable."};
 const old=(result.data as unknown as Record<string,string|null>)[column];
 let path:string|null=null;
 if(operation==="upload"){
  const file=form.get("image");if(!(file instanceof File))return {error:"Choose an image."};
  let bytes:Buffer;try{bytes=await prepareImage(file);}catch{return {error:"Invalid image. Use a still JPEG, PNG or WebP up to 2 MiB and 16 megapixels."};}
  path=`${kind}/${id}/${randomUUID()}.webp`;
  const upload=await supabase.storage.from("catalog-images").upload(path,bytes,{contentType:"image/webp",upsert:false});
  if(upload.error)return {error:"Upload failed. Check the catalog-images bucket and admin policies."};
 }
 const {error}=await supabase.rpc("catalog_set_image",{p_kind:kind,p_id:id,p_path:path,p_expected:old});
 if(error){if(path)await supabase.storage.from("catalog-images").remove([path]);return {error:"Image changed or could not be saved. Reload and retry."};}
 let cleanupFailed=false;
 if(old&&new RegExp(`^${kind}/${id}/[0-9a-f-]{36}\\.webp$`).test(old)){const cleanup=await supabase.storage.from("catalog-images").remove([old]);cleanupFailed=Boolean(cleanup.error);}
 revalidatePath("/admin","layout");
 return {success:cleanupFailed?"Image saved. The previous unused file needs storage cleanup.":"Image updated."};
}
