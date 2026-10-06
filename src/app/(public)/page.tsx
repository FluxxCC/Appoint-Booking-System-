import Link from "next/link";
import Image from "next/image";
import { readPublicWebsite, imageUrl } from "@/features/public-site/data.server";
import { ServiceCard, StaffCard } from "@/components/public-site/site";
import { formatClockTime } from "@/lib/time";

const weekDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function Home() {
  const site = await readPublicWebsite();
  const business = site.business;
  if (!business) return <main className="mx-auto max-w-3xl px-5 py-24 text-center"><p className="eyebrow">Welcome</p><h1 className="display-type mt-4 text-5xl">Our website is getting ready.</h1></main>;

  const customHero = imageUrl(site.website?.hero_image_path);
  const heroImage = customHero ?? "/images/hero-barber.webp";
  const featuredServices = site.services.slice(0, 3);
  const featuredStaff = site.staff.slice(0, 3);
  const bookingMessage = business.booking_approval_mode === "AUTO_CONFIRM" ? "Choose an available time and reserve it online." : "Choose a service and time. We’ll review your request and keep you updated.";

  return <main>
    <section className="border-b border-line bg-white">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-10 sm:py-16 lg:grid-cols-[1.05fr_.95fr] lg:gap-20 lg:py-20">
        <figure className="relative order-2 aspect-[5/4] overflow-hidden rounded-[1.75rem] bg-sand shadow-[0_24px_55px_-38px_#17263a88] lg:order-1 lg:rounded-[2rem]">
          <Image src={heroImage} alt={customHero ? business.name + " studio" : "A barber providing a haircut in a contemporary studio"} fill priority sizes="(max-width: 1024px) 100vw, 52vw" unoptimized={Boolean(customHero)} className="object-cover object-[72%_center]" />
        </figure>
        <div className="order-1 max-w-xl lg:order-2">
          <p className="eyebrow">{business.name}</p>
          <h1 className="display-type mt-5 text-[clamp(3rem,6vw,5.6rem)] leading-[.98]">Time well spent, from the very first click.</h1>
          <p className="mt-7 max-w-lg text-base leading-8 text-muted sm:text-lg">{business.description || "Thoughtful service and simple online booking at " + business.name + "."}</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link href="/book" className="button-primary px-7">Book an appointment <span aria-hidden="true">↗</span></Link><Link href="/services" className="button-secondary px-7">Explore services</Link></div>
          <p className="mt-6 border-t border-line pt-5 text-sm leading-6 text-muted">{bookingMessage}</p>
        </div>
      </div>
    </section>

    <section className="bg-sand px-5 py-14 sm:py-20">
      <div className="mx-auto max-w-7xl"><div className="max-w-xl"><p className="eyebrow">Simple booking</p><h2 className="display-type mt-3 text-3xl sm:text-4xl">From service to seat in three easy steps.</h2></div>
        <ol className="mt-9 grid divide-y divide-line border-y border-line md:grid-cols-3 md:divide-x md:divide-y-0">{[["01","Choose a service","See the duration, price and details first."],["02","Pick a time","Choose a professional and availability that fits."],["03","Stay informed",business.booking_approval_mode === "AUTO_CONFIRM" ? "Manage confirmation and payment from your private link." : "Receive updates and manage your appointment privately."]].map(([number,title,body]) => <li key={number} className="py-6 md:px-7 md:py-2 first:md:pl-0 last:md:pr-0"><span className="text-xs font-bold tracking-[.18em] text-accent-dark">{number}</span><h3 className="mt-3 text-lg font-semibold text-ink">{title}</h3><p className="mt-2 max-w-xs text-sm leading-6 text-muted">{body}</p></li>)}</ol>
      </div>
    </section>

    <section className="mx-auto max-w-7xl px-5 py-16 sm:py-24">
      <div className="mb-9 flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow">Services</p><h2 className="display-type mt-3 text-4xl sm:text-5xl">Choose what feels right.</h2></div><Link href="/services" className="text-sm font-semibold text-accent-dark underline underline-offset-4">View all services</Link></div>
      {featuredServices.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{featuredServices.map(service => <ServiceCard key={service.id} service={service} currency={business.currency} category={site.categories.find(category => category.id === service.category_id)?.name}/>)}</div> : <div className="surface-card p-8 text-center text-muted">Services will be listed here soon. <Link href="/contact" className="font-semibold text-accent-dark underline">Contact us</Link> for details.</div>}
    </section>

    <section className="border-y border-line bg-sand px-5 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl"><div className="mb-9 flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow">The people</p><h2 className="display-type mt-3 text-4xl sm:text-5xl">Our Team</h2><p className="mt-3 max-w-xl text-sm leading-6 text-muted">Meet the professionals who make every visit feel personal.</p></div><Link href="/team" className="text-sm font-semibold text-accent-dark underline underline-offset-4">Meet the whole team</Link></div>
        {featuredStaff.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{featuredStaff.map((staff,index) => <StaffCard key={staff.id} priority={index===0} staff={staff} services={site.services.filter(service => site.assignments.some(assignment => assignment.staff_id===staff.id && assignment.service_id===service.id)).map(service => service.name)}/>)}</div> : <div className="surface-card p-7 text-center"><p className="font-semibold text-ink">Our team profiles are coming soon.</p><p className="mt-2 text-sm text-muted">Visit our team page for updates or contact us for help choosing a professional.</p><Link href="/contact" className="button-secondary mt-5">Contact us</Link></div>}
      </div>
    </section>

    <section className="border-y border-line bg-white px-5 py-16 sm:py-24">
      <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[.95fr_1.05fr] lg:gap-20">
        <div className="relative aspect-[4/3] overflow-hidden rounded-[1.75rem] bg-sand"><Image src="/images/studio-interior.webp" alt="Welcoming studio interior and seating" fill sizes="(max-width: 1024px) 100vw, 48vw" className="object-cover"/></div>
        <div className="max-w-xl"><p className="eyebrow">The experience</p><h2 className="display-type mt-4 text-4xl sm:text-5xl">Good service begins with the details.</h2><p className="mt-6 text-base leading-8 text-muted">We make the practical parts clear, so you can focus on enjoying your visit.</p><dl className="mt-8 divide-y divide-line border-y border-line"><div className="py-4"><dt className="font-semibold text-ink">Clear before you book</dt><dd className="mt-1 text-sm leading-6 text-muted">Service duration and pricing are visible before you choose a time.</dd></div><div className="py-4"><dt className="font-semibold text-ink">Private appointment access</dt><dd className="mt-1 text-sm leading-6 text-muted">Use your secure booking link to view and manage your details.</dd></div></dl><Link href="/about" className="mt-8 inline-flex text-sm font-semibold text-accent-dark underline underline-offset-4">About {business.name} <span aria-hidden="true" className="ml-2">→</span></Link></div>
      </div>
    </section>

    <section className="border-t border-line bg-sand px-5 py-16 sm:py-20">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[.9fr_1.1fr] lg:gap-20"><div><p className="eyebrow">Plan your visit</p><h2 className="display-type mt-4 text-4xl sm:text-5xl">Everything you need, before you go.</h2><p className="mt-6 max-w-lg text-base leading-8 text-muted">{business.address || "Contact us for our location and visit details."}</p><p className="mt-4 text-sm text-muted">{business.contact_phone}{business.contact_phone && business.contact_email ? " · " : ""}{business.contact_email}</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/book" className="button-primary">Book now <span aria-hidden="true">↗</span></Link><Link href="/contact" className="button-secondary">Contact us</Link></div></div>
        <div className="rounded-[1.5rem] border border-line bg-white p-6 shadow-[0_18px_38px_-30px_#263b9190] sm:p-8"><div className="flex items-center justify-between gap-4"><h3 className="text-xl font-semibold text-ink">Opening hours</h3><Link href="/booking/manage" className="text-sm font-semibold text-accent-dark underline underline-offset-4">Manage booking</Link></div><div className="mt-5 divide-y divide-line">{site.hours.length ? site.hours.map(hour => <div className="flex items-center justify-between gap-4 py-3.5 text-sm" key={hour.weekday + "-" + hour.opens_at}><span className="text-muted">{weekDays[hour.weekday]}</span><span className="font-semibold text-ink">{formatClockTime(hour.opens_at)} – {formatClockTime(hour.closes_at)}</span></div>) : <p className="py-4 text-sm text-muted">Please contact us for opening hours.</p>}</div></div>
      </div>
    </section>
  </main>;
}
