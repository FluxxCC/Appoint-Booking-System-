import Link from "next/link";
import Image from "next/image";
import { readPublicWebsite, imageUrl } from "@/features/public-site/data.server";
import { ServiceCard, StaffCard } from "@/components/public-site/site";

const weekDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function Home() {
  const site = await readPublicWebsite();
  const business = site.business;
  if (!business) return <main className="mx-auto max-w-3xl px-5 py-24 text-center"><p className="eyebrow">Welcome</p><h1 className="display-type mt-4 text-5xl">Our website is getting ready.</h1></main>;

  const customHero = imageUrl(site.website?.hero_image_path);
  const heroImage = customHero ?? "/images/hero-barber.webp";
  const featuredServices = site.services.slice(0, 3);
  const featuredStaff = site.staff.slice(0, 3);

  return <main>
    <section className="mx-auto grid max-w-7xl items-center gap-10 px-5 pb-14 pt-9 sm:pb-20 sm:pt-14 lg:grid-cols-[.92fr_1.08fr] lg:gap-14 lg:py-16">
      <div className="order-2 max-w-2xl lg:order-1">
        <p className="eyebrow inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-2"><span aria-hidden="true" className="size-1.5 rounded-full bg-accent"/> A better way to book</p>
        <h1 className="display-type mt-5 text-[clamp(2.8rem,6vw,5.15rem)] leading-[1.02]">Make a little time for <span className="text-accent-dark">you.</span></h1>
        <p className="mt-6 max-w-xl text-base leading-7 text-muted sm:text-lg sm:leading-8">{business.description || `Thoughtful service and easy online booking at ${business.name}.`}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/book" className="button-primary px-6">Book an appointment <span aria-hidden="true">↗</span></Link>
          <Link href="/services" className="button-secondary px-6">Explore our services</Link>
        </div>
        <p className="mt-5 text-sm text-muted">{business.booking_approval_mode === "AUTO_CONFIRM" ? "Choose an available time and reserve your place." : "Choose a time and we’ll confirm your request."}</p>
        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 border-t border-line pt-6 text-sm text-muted">
          <span className="inline-flex items-center gap-2"><span className="grid size-5 place-items-center rounded-full bg-success-soft text-xs font-bold text-success">✓</span> Clear prices before booking</span>
          <span className="inline-flex items-center gap-2"><span className="grid size-5 place-items-center rounded-full bg-success-soft text-xs font-bold text-success">✓</span> Easy appointment management</span>
        </div>
      </div>

      <div className="relative order-1 mx-auto w-full max-w-[680px] lg:order-2">
        <div className="relative aspect-[1.12/1] overflow-hidden rounded-[1.8rem] bg-accent-soft sm:aspect-[1.25/1]">
          <Image src={heroImage} alt={customHero ? `${business.name} studio` : "A service professional welcoming a customer"} fill priority sizes="(max-width: 1024px) 100vw, 55vw" unoptimized={Boolean(customHero)} className="object-cover object-[63%_center]" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-ink/40 to-transparent" />
          <div className="absolute bottom-4 left-4 rounded-2xl border border-white/70 bg-white/95 px-4 py-3 shadow-lg backdrop-blur sm:bottom-6 sm:left-6 sm:px-5 sm:py-4">
            <p className="text-xs font-semibold uppercase tracking-[.13em] text-accent-dark">{business.name}</p>
            <p className="mt-1 text-sm font-semibold text-ink">Your next visit starts here</p>
          </div>
        </div>
        <div className="absolute -right-2 top-5 hidden max-w-52 rounded-2xl border border-line bg-white p-4 shadow-xl sm:block lg:-right-5 lg:top-8">
          <p className="text-xs font-semibold text-muted">PLAN YOUR VISIT</p>
          <p className="mt-2 text-sm font-semibold text-ink">Service, professional, time.</p>
          <p className="mt-1 text-xs leading-5 text-muted">Pick what works for you. We’ll take it from there.</p>
        </div>
      </div>
    </section>

    {site.announcements[0] && <aside className="border-y border-line bg-white px-5 py-4 text-center text-sm text-ink"><strong className="text-accent-dark">{site.announcements[0].title}</strong><span className="mx-2 text-line">·</span>{site.announcements[0].body}</aside>}

    <section className="border-y border-line bg-white px-5 py-12 sm:py-16">
      <div className="mx-auto grid max-w-7xl gap-7 sm:grid-cols-3 sm:gap-10">
        {[["01", "Choose your service", "See the details, duration and price before you decide."], ["02", "Find a time that fits", "Choose a professional and an available appointment time."], ["03", "Stay up to date", business.booking_approval_mode === "AUTO_CONFIRM" ? "Track your confirmation and payment from your booking link." : "We’ll review your request and keep you informed."]].map(([number, title, body]) => <article key={number} className="flex gap-4"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-sm font-bold text-accent-dark">{number}</span><div><h2 className="font-semibold text-ink">{title}</h2><p className="mt-1 text-sm leading-6 text-muted">{body}</p></div></article>)}
      </div>
    </section>

    <section className="mx-auto max-w-7xl px-5 py-16 sm:py-24">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Made for your day</p><h2 className="display-type mt-3 text-4xl sm:text-5xl">Services worth making time for.</h2></div><Link href="/services" className="text-sm font-semibold text-accent-dark underline underline-offset-4">See every service</Link></div>
      {featuredServices.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{featuredServices.map(service => <ServiceCard key={service.id} service={service} currency={business.currency} category={site.categories.find(category => category.id === service.category_id)?.name}/>)}</div> : <div className="surface-card p-8 text-center text-muted">Services will be listed here soon. <Link href="/contact" className="font-semibold text-accent-dark underline">Contact us</Link> for details.</div>}
    </section>

    <section className="bg-sand px-5 py-16 sm:py-24"><div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2 lg:gap-16"><div className="relative aspect-[5/4] overflow-hidden rounded-[1.6rem] shadow-lg"><Image src="/images/studio-interior.webp" alt="Welcoming studio interior and seating" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover"/></div><div><p className="eyebrow">A place to feel looked after</p><h2 className="display-type mt-3 text-4xl sm:text-5xl">Good service starts with the details.</h2><p className="mt-6 max-w-xl text-base leading-8 text-muted">{business.description || `At ${business.name}, every visit is an opportunity to feel looked after.`}</p><div className="mt-8 grid gap-4 border-t border-line pt-6 sm:grid-cols-2"><div><p className="font-semibold text-ink">Know before you go</p><p className="mt-1 text-sm leading-6 text-muted">See service duration and price before requesting a time.</p></div><div><p className="font-semibold text-ink">A time that works</p><p className="mt-1 text-sm leading-6 text-muted">Pick an available slot that fits your day.</p></div></div><Link href="/about" className="mt-8 inline-block text-sm font-semibold text-accent-dark underline underline-offset-4">Get to know us</Link></div></div></section>

    <section className="mx-auto max-w-7xl px-5 py-16 sm:py-24"><div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">The people</p><h2 className="display-type mt-3 text-4xl sm:text-5xl">Meet your professionals.</h2></div><Link href="/team" className="text-sm font-semibold text-accent-dark underline underline-offset-4">Meet the whole team</Link></div>{featuredStaff.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{featuredStaff.map(staff => <StaffCard key={staff.id} staff={staff} services={site.services.filter(service => site.assignments.some(assignment => assignment.staff_id === staff.id && assignment.service_id === service.id)).map(service => service.name)}/>)}</div> : <p className="text-muted">Team profiles are coming soon.</p>}</section>

    <section className="border-y border-line bg-white px-5 py-16 sm:py-20"><div className="mx-auto max-w-7xl"><p className="eyebrow">Inside the studio</p><h2 className="display-type mt-3 text-4xl sm:text-5xl">A feel for the place.</h2><div className="mt-8 grid gap-4 sm:grid-cols-3"><div className="relative aspect-[4/5] overflow-hidden rounded-2xl sm:col-span-2 sm:aspect-[3/2]"><Image src="/images/studio-interior.webp" alt="Interior and seating at the studio" fill sizes="(max-width: 640px) 100vw, 66vw" className="object-cover"/></div><div className="grid grid-cols-2 gap-4 sm:grid-cols-1"><div className="relative aspect-square overflow-hidden rounded-2xl"><Image src="/images/service-cut.webp" alt="Professional service in progress" fill sizes="(max-width: 640px) 50vw, 33vw" className="object-cover"/></div><div className="relative aspect-square overflow-hidden rounded-2xl"><Image src="/images/service-shave.webp" alt="Tools prepared for your appointment" fill sizes="(max-width: 640px) 50vw, 33vw" className="object-cover"/></div></div></div></div></section>

    <section className="mx-auto max-w-7xl px-5 py-16 sm:py-24"><div className="grid gap-10 lg:grid-cols-[1fr_.8fr]"><div><p className="eyebrow">Find us</p><h2 className="display-type mt-3 text-4xl sm:text-5xl">Your next visit is close.</h2><p className="mt-5 max-w-lg text-base leading-7 text-muted">{business.address || "Contact us for our location."}</p><p className="mt-3 text-sm text-muted">{business.contact_phone}{business.contact_phone && business.contact_email ? " · " : ""}{business.contact_email}</p><Link href="/contact" className="button-secondary mt-7">Location and contact details</Link></div><div className="surface-card p-6 sm:p-8"><h3 className="text-lg font-semibold">Opening hours</h3><div className="mt-4 space-y-1">{site.hours.length ? site.hours.map(hour => <div className="flex justify-between gap-3 border-b border-line py-2.5 text-sm" key={`${hour.weekday}-${hour.opens_at}`}><span className="text-muted">{weekDays[hour.weekday]}</span><span className="font-semibold">{hour.opens_at.slice(0,5)} – {hour.closes_at.slice(0,5)}</span></div>) : <p className="text-sm text-muted">Please contact us for opening hours.</p>}</div></div></div></section>

    <section className="bg-accent-dark px-5 py-14 text-white sm:py-16"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-on-dark-accent">Ready when you are</p><h2 className="display-type mt-3 text-3xl sm:text-4xl">Make room for your next visit.</h2></div><Link href="/book" className="inline-flex min-h-12 items-center rounded-xl bg-white px-6 py-3 font-bold text-accent-dark transition hover:bg-accent-soft">Book an appointment <span aria-hidden="true" className="ml-3">↗</span></Link></div></section>
  </main>;
}
