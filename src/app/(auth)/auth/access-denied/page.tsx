import Link from "next/link";
import { AuthCard } from "@/components/layout/auth-card";
import { logoutAction } from "@/features/auth/actions";

export default function AccessDeniedPage() {
  return <AuthCard title="Access unavailable" description="Your account does not have access to this workspace, or its access has been disabled. Contact the business owner if you believe this is a mistake.">
    <div className="flex flex-wrap gap-3"><Link href="/account" className="button-primary min-h-11">Open customer account</Link>
    <form action={logoutAction}><button className="button-secondary min-h-11">Sign out and switch account</button></form></div>
  </AuthCard>;
}
