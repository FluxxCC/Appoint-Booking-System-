"use client";
import { BackButton } from "@/components/ui/back-button";
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return <section role="alert" className="surface-card max-w-2xl p-6 sm:p-9"><p className="eyebrow">Something went wrong</p><h1 className="display-type mt-3 text-3xl">Workspace temporarily unavailable</h1><p className="mt-4 leading-7 text-muted">We could not load this page. Try again, clear any filters, or contact the business owner.</p><div className="mt-7 flex flex-wrap items-center gap-3"><button onClick={reset} className="button-primary">Try again</button><BackButton href="/admin">Back to dashboard</BackButton></div></section>;
}
