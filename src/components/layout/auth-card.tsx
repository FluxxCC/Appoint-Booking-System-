import Link from "next/link";

export function AuthCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-sand px-4 py-12 sm:px-6 before:absolute before:inset-x-0 before:top-0 before:h-48 before:bg-accent sm:before:h-64">
    <div className="relative w-full max-w-md">
      <Link href="/" className="mb-8 block text-xs font-bold uppercase tracking-[.15em] text-white">Appointment studio</Link>
      <section className="surface-card p-6 shadow-[0_22px_50px_-28px_#263b9190] sm:p-8">
        <h1 className="display-type text-3xl sm:text-4xl">{title}</h1>
        <p className="mb-7 mt-3 text-sm leading-6 text-muted">{description}</p>
        {children}
      </section>
      <p className="mt-6 text-center text-xs text-muted">Your account belongs to this business.</p>
    </div>
  </main>;
}
