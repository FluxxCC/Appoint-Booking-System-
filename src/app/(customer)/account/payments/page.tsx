import Link from "next/link";
import { requireArea } from "@/lib/auth/access.server";
import { money } from "@/features/public-site/model";
import { StatusBadge } from "@/components/ui/status-badge";

export default async function CustomerPaymentsPage() {
  const { supabase } = await requireArea("account");
  const { data, error } = await supabase.from("payments")
    .select("id,appointment_id,amount,currency,state,paid_at,created_at")
    .order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error("Your payments could not be loaded. Please try again.");
  return <div className="mx-auto max-w-3xl"><p className="eyebrow">Your account</p><h1 className="display-type mt-3 text-4xl">Payments</h1>
    {data?.length ? <div className="mt-7 space-y-3">{data.map(payment => <article key={payment.id} className="surface-card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xl font-semibold">{money(payment.amount,payment.currency)}</p><p className="mt-1 text-sm text-muted">{new Intl.DateTimeFormat("en",{dateStyle:"medium"}).format(new Date(payment.paid_at ?? payment.created_at))}</p></div><StatusBadge value={payment.state}>{payment.state === "SUCCEEDED" ? "Paid" : payment.state === "PENDING" ? "Pending" : payment.state === "FAILED" ? "Unsuccessful" : "Cancelled"}</StatusBadge></div><Link href={`/account/appointments/${payment.appointment_id}`} className="mt-4 inline-block text-sm font-semibold text-accent-dark underline">View appointment</Link></article>)}</div>
      : <div className="surface-card mt-7 p-8"><h2 className="display-type text-2xl">No payments yet</h2><p className="mt-2 text-muted">Your appointment payments and receipts will appear here.</p><Link href="/account/appointments" className="mt-5 inline-block font-semibold text-accent-dark underline">View appointments</Link></div>}
  </div>;
}
