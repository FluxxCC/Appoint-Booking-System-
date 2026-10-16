import { randomUUID } from "node:crypto";
import Link from "next/link";
import { readPublicBookingData } from "@/features/public-site/data.server";
import { BookingWizard } from "@/features/public-site/booking-wizard";
import { PublicBranchPicker } from "@/features/public-site/branch-picker";
import { readVerifiedUser } from "@/lib/auth/require-user.server";
import { signOutForGuestBookingAction } from "@/features/public-site/booking-actions";

function localDate(timeZone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export default async function BookPage({ searchParams }: { searchParams: Promise<{ service?: string; staff?: string; branch?: string; home?: string }> }) {
  const query = await searchParams;
  const site = await readPublicBookingData(query.branch);
  if (!site.business) return <main className="mx-auto max-w-3xl px-5 py-20 text-center"><h1 className="display-type text-4xl">Online booking is not available yet.</h1></main>;
  const { user } = await readVerifiedUser();
  if (user) {
    const params = new URLSearchParams();
    for (const key of ["branch", "service", "staff"] as const) {
      const value = query[key];
      if (value && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) params.set(key, value);
    }
    if (query.home === "1") params.set("home", "1");
    const selection = params.toString();
    const accountBookingUrl = `/account/book${selection ? `?${selection}` : ""}`;

    return <main className="mx-auto max-w-2xl px-5 py-16 sm:py-24">
      <p className="eyebrow">Booking account choice</p>
      <h1 className="display-type mt-3 text-4xl">An account is already signed in on this browser.</h1>
      <p className="mt-4 leading-7 text-muted">Choose whether to continue with that account. If this is a shared device or the account isn’t yours, sign out before continuing as a guest.</p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <Link href={accountBookingUrl} className="button-primary min-h-12 justify-center">Continue with signed-in account</Link>
        {site.business.guest_booking_enabled ? <form action={signOutForGuestBookingAction}>
          {[...params.entries()].map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
          <button className="button-secondary min-h-12 w-full justify-center">Sign out and book as guest</button>
        </form> : <p className="rounded-xl bg-warning-soft p-4 text-sm leading-6 text-ink sm:col-span-2">Guest booking is disabled for this business. Continue with the signed-in account to request an appointment.</p>}
      </div>
    </main>;
  }
  if (!site.branch) return <PublicBranchPicker site={site} serviceSlug={query.service} invalidSelection={Boolean(query.branch)} />;
  const today = localDate(site.branch.timezone), advance = site.policy?.maximum_advance_days ?? 90;
  const maxDate = new Date(Date.parse(`${today}T00:00:00Z`) + advance * 86_400_000).toISOString().slice(0, 10);
  return <BookingWizard site={{ ...site, branch: site.branch! }} serviceSlug={query.service} staffSlug={query.staff} initialHome={query.home === "1"} homeServiceAllowed={false} customer={null}
    today={today} maxDate={maxDate} requestKeySeed={randomUUID()} />;
}
