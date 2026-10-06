import Image from "next/image";
import Link from "next/link";
import { readPublicWebsite } from "@/features/public-site/data.server";
import { formatClockTime } from "@/lib/time";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function ContactPage() {
  const { business, hours } = await readPublicWebsite();
  return <main><section className="mx-auto max-w-7xl px-5 py-14 sm:py-20"><div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(360px,.85fr)] lg:items-start">
    <div><p className="eyebrow">Plan your visit</p><h1 className="display-type mt-4 text-5xl sm:text-6xl">Come by. We’ll take care of the rest.</h1><p className="mt-6 max-w-xl text-base leading-8 text-muted">Find the details you need before your appointment at {business?.name ?? "our studio"}.</p><div className="mt-10 grid gap-5 sm:grid-cols-2"><div className="surface-card p-6"><h2 className="text-sm font-semibold text-muted">Find us</h2><p className="mt-3 whitespace-pre-line text-base font-semibold leading-7">{business?.address || "Contact us for directions."}</p></div><div className="surface-card p-6"><h2 className="text-sm font-semibold text-muted">Get in touch</h2>{business?.contact_phone && <a href={`tel:${business.contact_phone}`} className="mt-3 block break-all font-semibold text-accent-dark underline underline-offset-4">{business.contact_phone}</a>}{business?.contact_email && <a href={`mailto:${business.contact_email}`} className="mt-3 block break-all font-semibold text-accent-dark underline underline-offset-4">{business.contact_email}</a>}{!business?.contact_phone && !business?.contact_email && <p className="mt-3 text-sm text-muted">Contact details will be available soon.</p>}</div></div><Link href="/book" className="button-primary mt-7">Book an appointment</Link></div>
    <div><div className="relative aspect-[5/4] overflow-hidden rounded-[1.25rem]"><Image src="/images/studio-interior.webp" alt="Welcoming contemporary barber studio interior" fill priority sizes="(max-width: 1024px) 100vw, 40vw" className="object-cover"/></div><section className="surface-card mt-5 p-6 sm:p-7"><h2 className="text-xl font-semibold">Opening hours</h2>{hours.length ? <ul className="mt-5 divide-y divide-line">{hours.map(hour => <li className="flex justify-between gap-4 py-3 text-sm" key={`${hour.weekday}-${hour.opens_at}`}><span>{days[hour.weekday]}</span><span className="font-semibold">{formatClockTime(hour.opens_at)} – {formatClockTime(hour.closes_at)}</span></li>)}</ul> : <p className="mt-4 text-sm text-muted">Please contact us for opening hours.</p>}</section></div>
  </div></section></main>;
}
