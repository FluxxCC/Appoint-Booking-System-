import Link from "next/link";
import { readCustomerAppointments } from "@/features/appointments/customer-data.server";
import { AppointmentList } from "@/components/customer/appointment-list";
import { requireArea } from "@/lib/auth/access.server";
export default async function CustomerAppointmentsPage(){const {supabase}=await requireArea("account"),{appointments}=await readCustomerAppointments(),{data}=await supabase.from("business_settings").select("timezone").maybeSingle();return <div className="mx-auto max-w-5xl"><Link href="/account" className="text-sm font-semibold text-accent-dark underline underline-offset-4">← Account overview</Link><h1 className="mt-4 display-type text-4xl">My appointments</h1><p className="mt-3 text-muted">Requests, confirmed visits and past appointments in one place.</p><div className="mt-8"><AppointmentList appointments={appointments} timezone={data?.timezone??"UTC"}/></div></div>}
