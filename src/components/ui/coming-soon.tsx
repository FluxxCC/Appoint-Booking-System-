export function ComingSoon({ title, description }: { title: string; description: string }) {
  return <section><p className="eyebrow mb-2">Workspace</p><h1 className="display-type text-4xl">{title}</h1><div className="surface-card mt-8 p-8 sm:p-12"><span className="rounded-full bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent-dark">Coming in a future phase</span><p className="mt-5 max-w-xl text-base leading-7 text-muted">{description}</p></div></section>;
}
