"use client";
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return <section role="alert" className="surface-card max-w-2xl p-6 sm:p-9"><p className="eyebrow">Something went wrong</p><h1 className="display-type mt-3 text-3xl">Your workspace is temporarily unavailable</h1><p className="mt-4 leading-7 text-muted">We could not load this page. Try again, or contact the business owner if the problem continues.</p><button onClick={reset} className="button-primary mt-7">Try again</button></section>;
}
