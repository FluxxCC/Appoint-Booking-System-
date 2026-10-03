import Link from "next/link";
import { AuthCard } from "@/components/layout/auth-card";
import { logoutAction } from "@/features/auth/actions";

export default function AccessDeniedPage() {
  return <AuthCard title="Access unavailable" description="Your account does not have access to this workspace, or its access has been disabled. Contact the business owner if you believe this is a mistake.">
    <Link href="/account" className="text-sm font-medium text-accent-dark">Open customer account</Link>
    <form action={logoutAction} className="mt-5"><button className="text-sm font-medium text-ink">Sign out and switch account</button></form>
  </AuthCard>;
}
