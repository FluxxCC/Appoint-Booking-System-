"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return <main className="mx-auto max-w-2xl px-5 py-20"><section role="alert" className="surface-card p-6 sm:p-9"><p className="eyebrow">Something went wrong</p><h1 className="display-type mt-3 text-3xl">This workspace is temporarily unavailable</h1><p className="mt-4 leading-7 text-muted">Please try again or contact the business owner. A new installation needs its Supabase connection and migrations configured before account access is available.</p><div className="mt-7 flex flex-wrap gap-3"><button onClick={reset} className="button-primary">Try again</button><Link className="button-secondary" href="/login">Sign in</Link></div></section></main>;
}
