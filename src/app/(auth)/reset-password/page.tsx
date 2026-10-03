import { AuthCard } from "@/components/layout/auth-card";
import { AuthForm } from "@/components/forms/auth-form";
import { resetPasswordAction } from "@/features/auth/actions";
import { requireArea } from "@/lib/auth/access.server";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  await requireArea("account");
  return <AuthCard title="Choose your password" description="Set a strong password. You will sign in again after saving it.">
    <AuthForm action={resetPasswordAction} submitLabel="Save password" fields={[
      { name: "password", label: "New password", type: "password", autoComplete: "new-password", hint: "At least 12 characters.", maxLength: 128 },
      { name: "confirmPassword", label: "Confirm new password", type: "password", autoComplete: "new-password", maxLength: 128 },
    ]} />
  </AuthCard>;
}
