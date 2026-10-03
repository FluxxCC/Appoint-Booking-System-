import { AuthCard } from "@/components/layout/auth-card";
import { AuthForm } from "@/components/forms/auth-form";
import { confirmEmailAction } from "@/features/auth/actions";

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string }> }) {
  const params = await searchParams;
  // Verification is POSTed deliberately, so email link scanners cannot consume it on GET.
  return <AuthCard title="Confirm your email link" description="Continue to verify your account or securely set your password.">
    <AuthForm action={confirmEmailAction} submitLabel="Continue securely" fields={[]} hidden={{ token_hash: params.token_hash ?? "", type: params.type ?? "" }} />
  </AuthCard>;
}
