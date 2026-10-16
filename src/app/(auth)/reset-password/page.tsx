import { AuthCard } from "@/components/layout/auth-card";
import { AuthForm } from "@/components/forms/auth-form";
import { resetPasswordAction } from "@/features/auth/actions";
import { requireArea } from "@/lib/auth/access.server";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ portal?: string }> }) {
  await requireArea("account");
  const { portal } = await searchParams;
  const safePortal = portal === "owner" || portal === "admin" || portal === "staff" ? portal : "";
  const invited = Boolean(safePortal);
  return <AuthCard title={invited ? "Choose your invitation password" : "Choose your password"} description="Set a strong password. You will sign in again after saving it.">
    <AuthForm action={resetPasswordAction} submitLabel="Save password" fields={[
      { name: "password", label: "New password", type: "password", autoComplete: "new-password", hint: "At least 8 characters.", minLength: 8, maxLength: 128 },
      { name: "confirmPassword", label: "Confirm new password", type: "password", autoComplete: "new-password", maxLength: 128 },
    ]} hidden={invited ? { portal: safePortal } : {}} />
  </AuthCard>;
}
