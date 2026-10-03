import Link from "next/link";
import { AuthCard } from "@/components/layout/auth-card";
import { AuthForm } from "@/components/forms/auth-form";
import { forgotPasswordAction } from "@/features/auth/actions";

export default function ForgotPasswordPage() {
  return <AuthCard title="Reset your password" description="Enter your account email and we’ll send a password reset link.">
    <AuthForm action={forgotPasswordAction} submitLabel="Send reset link" fields={[{ name: "email", label: "Email address", type: "email", autoComplete: "email" }]} />
    <Link className="mt-6 block text-sm text-accent-dark" href="/login">Back to sign in</Link>
  </AuthCard>;
}
