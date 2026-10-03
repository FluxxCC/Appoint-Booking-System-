import { AuthCard } from "@/components/layout/auth-card";
import { AuthForm } from "@/components/forms/auth-form";
import { resendConfirmationAction } from "@/features/auth/actions";
export default function VerifyEmailPage() {
  return <AuthCard title="Verify your email" description="Request a new verification link if the previous email expired or did not arrive."><AuthForm action={resendConfirmationAction} submitLabel="Send verification email" fields={[{ name: "email", label: "Email address", type: "email", autoComplete: "email" }]} /></AuthCard>;
}
