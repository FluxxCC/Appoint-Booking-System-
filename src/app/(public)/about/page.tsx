import Image from "next/image";
import Link from "next/link";
import { readPublicWebsite } from "@/features/public-site/data.server";

export default async function AboutPage() {
  const { business } = await readPublicWebsite();
  return <main>
    <section className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-14 sm:py-20 lg:grid-cols-2 lg:gap-16">
      <div><p className="eyebrow">Our story</p><h1 className="display-type mt-4 text-5xl sm:text-6xl">A place made for your next visit.</h1><p className="mt-7 max-w-xl text-lg leading-8 text-muted">{business?.description || `At ${business?.name ?? "our studio"}, thoughtful service begins with making time for people.`}</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/book" className="button-primary">Book an appointment</Link><Link href="/team" className="button-secondary">Meet the team</Link></div></div>
      <div className="relative aspect-[4/5] overflow-hidden rounded-[1.25rem] sm:aspect-[5/4] lg:aspect-[4/5]"><Image src="/images/studio-interior.webp" alt="Welcoming contemporary barber studio interior" fill priority sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover"/></div>
    </section>
    <section className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-5 py-16 sm:py-20"><div><p className="eyebrow">Ready to visit?</p><h2 className="display-type mt-3 text-3xl sm:text-4xl">Choose a service that suits you.</h2></div><Link href="/services" className="button-primary">Explore services</Link></section>
  </main>;
}
