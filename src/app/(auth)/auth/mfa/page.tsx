import { redirect } from "next/navigation";
import { AuthCard } from "@/components/layout/auth-card";
import { MfaPanel } from "@/features/auth/mfa-panel";
import { getAccess } from "@/lib/auth/access.server";
import { logoutAction } from "@/features/auth/actions";
import { safeAppointmentDestination } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = safeAppointmentDestination(next);
  const destination = safeNext?.startsWith("/admin/appointments/") ? safeNext : "/admin";
  const { principal } = await getAccess();
  if (!principal) redirect("/login");
  if (!principal.profileActive || !principal.roles.some(role => role === "OWNER" || role === "ADMIN")) redirect("/auth/access-denied");
  if (principal.aal === "aal2") redirect(destination);
  return <AuthCard title="Protect your business account" description="Owner and administrator access requires an authenticator code each time you sign in."><MfaPanel nextPath={destination} /><form action={logoutAction} className="mt-6"><button className="text-sm text-muted">Sign out</button></form></AuthCard>;
}
