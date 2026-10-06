import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { BackButton } from "@/components/ui/back-button";
import type { Metadata } from "next";
import { readVerifiedUser } from "@/lib/auth/require-user.server";
import { readGuestBooking } from "@/features/public-site/booking-data.server";
import { readPublicWebsite } from "@/features/public-site/data.server";
import { appointmentStatus } from "@/features/appointments/customer-status";
import { bookingGuidance } from "@/features/appointments/customer-guidance";
import { formatBusinessTime } from "@/lib/time";
import { money } from "@/features/public-site/model";
import type { Database } from "@/types/database.generated";

type Confirmation = {
  id: string;
  public_reference?: string;
  reference?: string;
  state: Database["public"]["Enums"]["appointment_state"];
  starts_at: string;
  currency: string;
  total_amount: number;
  payment_mode_snapshot?: string;
  payment_mode?: string;
  required_payment_amount: number;
  payment_due_at?: string | null;
  staff_id?: string;
  customer_id?: string;
  service_name?: string;
  staff_name?: string;
  timezone?: string;
};

export const metadata: Metadata = { title: "Booking status", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function BookingConfirmation({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const [{ id }, site, { user, supabase }] = await Promise.all([searchParams, readPublicWebsite(), readVerifiedUser()]);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) redirect("/book");
  let a: Confirmation | null = null;
  let accessMethod: "account" | "guest" | null = null;
  if (user) {
    const { data } = await supabase.from("appointments").select("id,public_reference,state,starts_at,ends_at,currency,total_amount,payment_mode_snapshot,required_payment_amount,payment_due_at,customer_id,staff_id").eq("id", id).maybeSingle();
    if (data) {
      const [{ data: item }, { data: staff }, { data: customer }] = await Promise.all([
        supabase.from("appointment_items").select("service_name_snapshot,duration_minutes").eq("appointment_id", id).maybeSingle(),
        supabase.from("staff").select("display_name").eq("id", data.staff_id).maybeSingle(),
        supabase.from("customers").select("id,display_name").eq("auth_user_id", user.id).maybeSingle(),
      ]);
      if (customer?.id === data.customer_id) { a = { ...data, service_name: item?.service_name_snapshot, staff_name: staff?.display_name }; accessMethod = "account"; }
    }
  }
  if (!a) {
    const guest = await readGuestBooking(id);
    if (guest && guest.id === id) { a = guest as unknown as Confirmation; accessMethod = "guest"; }
  }
  if (!a) redirect("/booking/manage");
  const timeZone = site.business?.timezone ?? String(a.timezone ?? "UTC");
  const currency = String(a.currency ?? site.business?.currency ?? "USD");
  const required = Number(a.required_payment_amount ?? 0);
  const mode = a.payment_mode_snapshot ?? a.payment_mode;
  const emailStatus = accessMethod === "guest" ? (await cookies()).get(`guest_booking_email_${a.id}`)?.value : null;
  return <main className="mx-auto max-w-2xl px-5 py-14 sm:py-20"><div className="surface-card p-6 sm:p-10">
    <p className="eyebrow">Booking status</p>
    <h1 className="mt-3 display-type text-4xl">{a.state === "PENDING" ? "Booking request submitted" : a.state === "CONFIRMED" ? "Booking confirmed" : appointmentStatus(a.state)}</h1>
    <p className="mt-4 leading-7 text-muted">Status: <strong className="text-ink">{appointmentStatus(a.state)}</strong>. {bookingGuidance(a.state)}</p>
    {accessMethod === "guest" && emailStatus === "sent" && <p className="mt-4 rounded-xl bg-accent-soft p-4 text-sm">We sent a private access link to your booking email. Keep this browser access while your request is pending.</p>}
    {accessMethod === "guest" && emailStatus === "queued" && <p className="mt-4 rounded-xl bg-accent-soft p-4 text-sm">A private access link is queued for your booking email. Keep this browser access while the message is being sent.</p>}
    {accessMethod === "guest" && emailStatus === "unavailable" && <p className="mt-4 rounded-xl bg-warning-soft p-4 text-sm">The booking succeeded, but we could not send an email link. Keep this browser access and contact the business if you lose it.</p>}
    <div className="mt-8 rounded-2xl border border-line bg-canvas p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Your reference</p>
      <p className="mt-1 break-all font-mono font-semibold">{a.public_reference ?? a.reference ?? "Reference unavailable"}</p>
      <p className="mt-6 text-lg font-semibold">{a.service_name}</p>
      <p className="mt-1 text-sm text-muted">{formatBusinessTime(String(a.starts_at), timeZone)} · {a.staff_name}</p>
      <div className="mt-5 border-t border-line pt-4"><p className="font-semibold">{money(Number(a.total_amount ?? 0), currency)}</p><p className="mt-1 text-sm text-muted">{mode === "PAY_AT_BUSINESS" ? "Pay at the business" : a.state === "AWAITING_PAYMENT" ? `${money(required, currency)} required` : "Payment required only after acceptance"}</p></div>
      {a.state === "AWAITING_PAYMENT" && a.payment_due_at && <p className="mt-2 text-sm text-muted">Payment deadline: {formatBusinessTime(a.payment_due_at, timeZone)}</p>}
    </div>
    <div className="mt-7 flex flex-wrap gap-3"><Link href={accessMethod === "account"?`/account/appointments/${a.id}`:`/booking/manage?id=${encodeURIComponent(a.id)}`} className="button-primary">View booking</Link><BackButton href="/">Back to home</BackButton></div>
  </div></main>;
}
