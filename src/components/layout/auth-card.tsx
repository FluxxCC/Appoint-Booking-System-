import Link from "next/link";
import Image from "next/image";
import { readPublicWebsite } from "@/features/public-site/data.server";

export async function AuthCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  const site = await readPublicWebsite().catch(() => null);
  const brand = site?.business?.name?.trim() || "Usteng Barber Shop";

  return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-sand px-4 py-12 sm:px-6 before:absolute before:inset-x-0 before:top-0 before:h-48 before:bg-accent sm:before:h-64">
    <div className="relative w-full max-w-md">
      <Link href="/" aria-label={`${brand} home`} className="mb-8 flex min-h-14 min-w-0 max-w-full items-center gap-3 rounded-xl bg-accent px-3 py-2 text-xs font-bold uppercase tracking-[.15em] text-white shadow-sm">
        <span className="relative size-11 shrink-0 overflow-hidden rounded-lg border border-white/25 bg-[#f8f6e8] shadow-sm">
          <Image src="/images/usteng-barber-shop-mark.png" alt="" fill sizes="88px" className="object-cover" />
        </span>
        <span className="min-w-0 truncate">{brand}</span>
      </Link>
      <section className="surface-card p-6 shadow-[0_22px_50px_-28px_#49341f90] sm:p-8">
        <h1 className="display-type text-3xl sm:text-4xl">{title}</h1>
        <p className="mb-7 mt-3 text-sm leading-6 text-muted">{description}</p>
        {children}
      </section>
      <p className="mt-6 text-center text-xs text-muted">Your account belongs to this business.</p>
    </div>
  </main>;
}
