import { BackButton } from "@/components/ui/back-button";
import { AuthCard } from "@/components/layout/auth-card";
import { AuthForm } from "@/components/forms/auth-form";
import { forgotPasswordAction } from "@/features/auth/actions";

export default function ForgotPasswordPage() {
  return <AuthCard title="Reset your password" description="Enter your account email and we’ll send a password reset link.">
    <AuthForm action={forgotPasswordAction} submitLabel="Send reset link" fields={[{ name: "email", label: "Email address", type: "email", autoComplete: "email" }]} />
    <BackButton className="mt-6" href="/login">Back to sign in</BackButton>
  </AuthCard>;
}
