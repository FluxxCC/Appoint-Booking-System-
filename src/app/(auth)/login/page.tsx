import Link from "next/link";
import { AuthCard } from "@/components/layout/auth-card";
import { AuthForm } from "@/components/forms/auth-form";
import { loginAction } from "@/features/auth/actions";
import { safeAppointmentDestination } from "@/lib/auth/access";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ notice?: string; next?: string }> }) {
  const { notice, next } = await searchParams;
  const safeNext = safeAppointmentDestination(next);
  return <AuthCard title="Customer sign in" description="Sign in to manage your customer account and appointments.">
    {notice === "password-updated" && <p role="status" className="mb-5 text-sm text-accent-dark">Password updated. Sign in with your new password.</p>}
    <AuthForm action={loginAction} submitLabel="Sign in" fields={[
      { name: "email", label: "Email address", type: "email", autoComplete: "email" },
      { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
    ]} hidden={safeNext ? { next: safeNext } : {}} />
    <div className="mt-6 flex flex-wrap justify-between gap-3 text-sm text-accent-dark"><Link href="/forgot-password">Forgot password?</Link><Link href="/register">Create an account</Link></div>
    <div className="mt-7 border-t border-line pt-6"><p className="text-sm font-semibold">No account needed to book</p><p className="mt-2 text-sm text-muted">You can choose a service and request an appointment as a guest.</p><Link href="/book" className="button-secondary mt-4 w-full justify-center">Continue as guest</Link></div>
  </AuthCard>;
}
