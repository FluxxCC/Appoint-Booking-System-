import Link from "next/link";

export function BackButton({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return <Link href={href} className={`button-secondary inline-flex min-h-10 items-center gap-2 px-4 py-2 text-sm ${className}`}>
    <span aria-hidden="true">←</span>
    <span>{children}</span>
  </Link>;
}
