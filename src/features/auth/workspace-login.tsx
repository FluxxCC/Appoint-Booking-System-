import Link from "next/link";
import { AuthCard } from "@/components/layout/auth-card";
import { AuthForm } from "@/components/forms/auth-form";
import { safeAppointmentDestination, type AppRole } from "@/lib/auth/access";
import { adminLoginAction, ownerLoginAction, staffLoginAction } from "./actions";

const portals = {
  OWNER: {
    title: "Owner sign in",
    submitLabel: "Sign in",
    description: "Sign in to manage your business. Owner access also requires authenticator verification.",
    action: ownerLoginAction,
  },
  ADMIN: {
    title: "Administrator sign in",
    submitLabel: "Sign in",
    description: "Sign in to manage day-to-day business operations. Administrator access also requires authenticator verification.",
    action: adminLoginAction,
  },
  STAFF: {
    title: "Staff sign in",
    submitLabel: "Sign in",
    description: "Sign in to view your schedule and manage your assigned appointments.",
    action: staffLoginAction,
  },
} satisfies Record<AppRole, { title: string; submitLabel: string; description: string; action: typeof ownerLoginAction }>;

export function WorkspaceLogin({ role, next, notice }: { role: AppRole; next?: string; notice?: string }) {
  const portal = portals[role];
  const safeNext = safeAppointmentDestination(next);
  return <AuthCard title={portal.title} description={portal.description}>
    {notice === "invite-pending" && <p role="status" className="mb-5 text-sm text-accent-dark">Your email is confirmed and password is set. An owner must activate your administrator access before you can sign in.</p>}
    {notice === "invite-confirmed" && <p role="status" className="mb-5 text-sm text-accent-dark">Your invitation is confirmed and password is set. Sign in with your work account.</p>}
    <AuthForm action={portal.action} submitLabel={portal.submitLabel} fields={[
      { name: "email", label: "Account email", type: "email", autoComplete: "email" },
      { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
    ]} hidden={safeNext ? { next: safeNext } : {}} />
    <Link href="/forgot-password" className="mt-5 inline-block text-sm font-medium text-accent-dark">Forgot password?</Link>
  </AuthCard>;
}
