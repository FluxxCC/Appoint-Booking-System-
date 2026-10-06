import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { BackButton } from "@/components/ui/back-button";
import { readPublicWebsite, imageUrl } from "@/features/public-site/data.server";
import { money } from "@/features/public-site/model";
import { demoServiceImage } from "@/features/public-site/demo-images";

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await readPublicWebsite();
  const service = site.services.find(item => item.slug === slug);
  if (!service) notFound();
  const staff = site.staff.filter(person => site.assignments.some(assignment => assignment.staff_id === person.id && assignment.service_id === service.id));
  const image = imageUrl(service.image_path) ?? demoServiceImage(service.name);
  const category = site.categories.find(item => item.id === service.category_id)?.name;
  return <main className="mx-auto max-w-7xl px-5 py-10 sm:py-16"><BackButton href="/services">Back to services</BackButton><div className="mt-7 grid gap-9 lg:grid-cols-[1.05fr_.95fr] lg:gap-14"><div className="relative aspect-[4/3] overflow-hidden rounded-[1.25rem] lg:aspect-[4/5]"><Image src={image} alt={service.image_path ? service.name : "Barber service demo photograph"} fill priority unoptimized={Boolean(service.image_path)} sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover"/></div><div className="lg:sticky lg:top-28 lg:self-start"><p className="eyebrow">{category ?? "Service"} · {service.duration_minutes} minutes</p><h1 className="display-type mt-4 text-5xl sm:text-6xl">{service.name}</h1><p className="mt-6 whitespace-pre-line text-base leading-8 text-muted">{service.description || "A considered service, tailored to you."}</p><div className="surface-card mt-8 p-6"><div className="flex items-baseline justify-between gap-3"><span className="text-sm font-semibold text-muted">Service price</span><strong className="text-2xl text-ink">{money(service.price_amount,site.business?.currency??"USD")}</strong></div><p className="mt-3 border-t border-line pt-3 text-sm leading-6 text-muted">{service.payment_mode === "PAY_AT_BUSINESS" ? "Pay at your visit." : service.payment_mode === "DEPOSIT" ? `A ${money(service.deposit_amount,site.business?.currency??"USD")} deposit is due only after the request is accepted.` : "Full payment is due only after the request is accepted."}</p><Link href={`/book?service=${service.slug}`} className="button-primary mt-6 w-full">Book this service</Link></div><section className="mt-9"><h2 className="text-lg font-semibold">Available professionals</h2>{staff.length ? <div className="mt-4 flex flex-wrap gap-2">{staff.map(person => <Link key={person.id} href={`/team/${person.slug}`} className="button-secondary">{person.display_name}</Link>)}</div> : <p className="mt-3 text-sm text-muted">No professionals are currently listed for this service.</p>}</section></div></div></main>;
}
