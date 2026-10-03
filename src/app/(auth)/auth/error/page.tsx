import Link from "next/link";
import { AuthCard } from "@/components/layout/auth-card";

export default function AuthErrorPage() {
  return <AuthCard title="We couldn’t complete that request" description="Your email link may have expired, already been used, or opened in a different browser. Try signing in, or request a fresh password reset link.">
    <div className="flex flex-wrap gap-4 text-sm font-medium text-accent-dark"><Link href="/login">Sign in</Link><Link href="/forgot-password">Request a reset link</Link></div>
  </AuthCard>;
}
