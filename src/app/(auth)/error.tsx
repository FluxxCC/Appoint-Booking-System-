"use client";
import Link from "next/link";

export default function AuthBoundary({ reset }: { error: Error; reset: () => void }) {
  return <main className="mx-auto max-w-2xl px-5 py-20"><section role="alert" className="surface-card p-6 sm:p-9"><p className="eyebrow">Something went wrong</p><h1 className="display-type mt-3 text-3xl">Sign in is temporarily unavailable</h1><p className="mt-4 leading-7 text-muted">Please try again. For a new deployment, the owner must configure Supabase and apply the account migration.</p><div className="mt-7 flex flex-wrap gap-3"><button onClick={reset} className="button-primary">Try again</button><Link href="/" className="button-secondary">Home</Link></div></section></main>;
}
