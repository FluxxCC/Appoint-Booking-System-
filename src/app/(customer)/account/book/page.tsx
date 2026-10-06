import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { BackButton } from "@/components/ui/back-button";
import { requireArea } from "@/lib/auth/access.server";
import { provisionVerifiedCustomer } from "@/features/auth/provision-customer.server";
import { readPublicWebsite } from "@/features/public-site/data.server";
import { BookingWizard } from "@/features/public-site/booking-wizard";

function localDate(timeZone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export default async function AccountBookingPage({ searchParams }: { searchParams: Promise<{ service?: string; staff?: string }> }) {
  const [{ supabase, principal }, site, query] = await Promise.all([
    requireArea("account"),
    readPublicWebsite(),
    searchParams,
  ]);

  let { data: customer } = await supabase.from("customers").select("display_name,email,phone").eq("auth_user_id", principal.userId).maybeSingle();
  if (!customer?.display_name?.trim() || customer.display_name.trim().length < 2) {
    if (await provisionVerifiedCustomer(supabase)) {
      ({ data: customer } = await supabase.from("customers").select("display_name,email,phone").eq("auth_user_id", principal.userId).maybeSingle());
    }
  }
  if (!customer?.display_name?.trim() || customer.display_name.trim().length < 2) redirect("/account/setup");

  if (!site.business) {
    return <div className="mx-auto max-w-3xl px-5 py-12">
      <p className="eyebrow">Appointments</p>
      <h1 className="display-type mt-3 text-4xl">Booking is unavailable right now.</h1>
      <p className="mt-3 text-muted">Please try again later or return to your account overview.</p>
      <BackButton className="mt-6" href="/account">Back to account</BackButton>
    </div>;
  }

  const today = localDate(site.business.timezone);
  const advance = site.policy?.maximum_advance_days ?? 90;
  const maxDate = new Date(Date.parse(`${today}T00:00:00Z`) + advance * 86_400_000).toISOString().slice(0, 10);

  return <div>
    <div className="mx-auto max-w-5xl px-4 pt-5 sm:px-6">
      <BackButton href="/account">Back to account overview</BackButton>
    </div>
    <BookingWizard
      site={site}
      serviceSlug={query.service}
      staffSlug={query.staff}
      customer={{ name: customer.display_name, email: principal.email || customer.email || "", phone: customer.phone }}
      today={today}
      maxDate={maxDate}
      requestKeySeed={randomUUID()}
    />
  </div>;
}
