import Link from "next/link";

export function AuthCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center bg-sand px-4 py-12 sm:px-6">
    <div className="w-full max-w-md">
      <Link href="/" className="eyebrow mb-8 block">Appointment studio</Link>
      <section className="surface-card p-6 sm:p-8">
        <h1 className="display-type text-3xl sm:text-4xl">{title}</h1>
        <p className="mb-7 mt-3 text-sm leading-6 text-muted">{description}</p>
        {children}
      </section>
      <p className="mt-6 text-center text-xs text-muted">Your account belongs to this business.</p>
    </div>
  </main>;
}
