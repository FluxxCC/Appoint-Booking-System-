import { AuthCard } from "@/components/layout/auth-card";
import { AuthForm } from "@/components/forms/auth-form";
import { confirmEmailAction } from "@/features/auth/actions";

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string; portal?: string }> }) {
  const params = await searchParams;
  // Verification is POSTed deliberately, so email link scanners cannot consume it on GET.
  const isSignup = params.type === "signup";
  const isInvite = params.type === "invite";
  const title = isSignup ? "Confirm your email address" : isInvite ? "Accept your invitation" : "Confirm your email link";
  const description = isSignup
    ? "Confirm your email to finish signup. You’ll then continue to customer sign in."
    : isInvite
      ? "Confirm your invitation to choose a password and continue to your role’s sign-in page."
      : "Continue to verify your account or securely set your password.";
  const submitLabel = isSignup ? "Confirm email and continue" : isInvite ? "Confirm invitation" : "Continue securely";
  return <AuthCard title={title} description={description}>
    <AuthForm action={confirmEmailAction} submitLabel={submitLabel} fields={[]} hidden={{ token_hash: params.token_hash ?? "", type: params.type ?? "", portal: params.portal ?? "" }} />
  </AuthCard>;
}
