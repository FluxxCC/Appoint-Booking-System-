import { randomUUID } from "node:crypto";
import Link from "next/link";
import { readPublicWebsite } from "@/features/public-site/data.server";
import { BookingWizard } from "@/features/public-site/booking-wizard";
import { readVerifiedUser } from "@/lib/auth/require-user.server";
function localDate(timeZone:string,date=new Date()){const p=new Intl.DateTimeFormat("en-US",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);const get=(x:string)=>p.find(y=>y.type===x)?.value??"00";return `${get("year")}-${get("month")}-${get("day")}`}
export default async function BookPage({searchParams}:{searchParams:Promise<{service?:string;staff?:string}>}){const [site,query]=await Promise.all([readPublicWebsite(),searchParams]);if(!site.business)return <main className="mx-auto max-w-3xl px-5 py-20 text-center"><h1 className="display-type text-4xl">Online booking is not available yet.</h1></main>;const {user,supabase}=await readVerifiedUser();let customer=null;if(user){const {data}=await supabase.from("customers").select("display_name,email,phone").eq("auth_user_id",user.id).maybeSingle();if(data)customer={name:data.display_name,email:user.email??data.email??"",phone:data.phone};}
 if(user&&!customer)return <main className="mx-auto max-w-2xl px-5 py-20"><h1 className="display-type text-4xl">Finish setting up your account</h1><p className="mt-4 leading-7 text-muted">Add your customer profile before submitting a booking request.</p><Link href="/account/setup" className="mt-6 inline-block underline">Complete profile</Link></main>;
 const today=localDate(site.business.timezone),advance=site.policy?.maximum_advance_days??90,maxDate=new Date(Date.parse(`${today}T00:00:00Z`)+advance*86400000).toISOString().slice(0,10);
 return <BookingWizard site={site} serviceSlug={query.service} staffSlug={query.staff} customer={customer} today={today} maxDate={maxDate} requestKeySeed={randomUUID()}/>}
