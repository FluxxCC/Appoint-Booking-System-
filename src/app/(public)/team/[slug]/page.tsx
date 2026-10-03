import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { readPublicWebsite, imageUrl } from "@/features/public-site/data.server";
import { money } from "@/features/public-site/model";

export default async function TeamMemberPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await readPublicWebsite();
  const member = site.staff.find(person => person.slug === slug);
  if (!member) notFound();
  const services = site.services.filter(service => site.assignments.some(assignment => assignment.staff_id === member.id && assignment.service_id === service.id));
  const customImage = imageUrl(member.photo_path);
  return <main className="mx-auto max-w-7xl px-5 py-10 sm:py-16"><Link href="/team" className="text-sm font-semibold text-accent-dark">← The team</Link><div className="mt-7 grid gap-10 lg:grid-cols-[.8fr_1fr] lg:gap-16"><div className="relative aspect-[4/5] overflow-hidden rounded-[1.25rem]"><Image src={customImage ?? "/images/staff-portrait.webp"} alt={customImage ? `${member.display_name}, service professional` : "Representative demo portrait of a barber"} fill priority unoptimized={Boolean(customImage)} sizes="(max-width: 1024px) 100vw, 44vw" className="object-cover"/>{!customImage&&<span className="absolute bottom-4 left-4 rounded-md bg-white/95 px-2 py-1 text-[10px] font-semibold text-ink">Demo portrait</span>}</div><div className="self-center"><p className="eyebrow">Meet the team</p><h1 className="display-type mt-4 text-5xl sm:text-6xl">{member.display_name}</h1><p className="mt-6 whitespace-pre-line text-base leading-8 text-muted">{member.bio || "A thoughtful professional dedicated to making every visit a good one."}</p><section className="mt-10"><h2 className="text-lg font-semibold">Services with {member.display_name}</h2><div className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface px-5">{services.map(service => <div className="flex items-center justify-between gap-4 py-4" key={service.id}><div><p className="font-semibold">{service.name}</p><p className="mt-1 text-sm text-muted">{service.duration_minutes} minutes · {money(service.price_amount,site.business?.currency??"USD")}</p></div><Link href={`/book?service=${service.slug}&staff=${member.slug}`} className="text-sm font-bold text-accent-dark underline underline-offset-4">Book</Link></div>)}{!services.length&&<p className="py-5 text-sm text-muted">No services are currently listed for this professional.</p>}</div></section><Link href={`/book?staff=${member.slug}`} className="button-primary mt-7">Book with {member.display_name}</Link></div></div></main>;
}
