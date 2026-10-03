import "server-only";
import { redirect } from "next/navigation";
import { z } from "zod";
import { readVerifiedUser } from "./require-user.server";
import { accessDecision, landingPath, safeAppointmentDestination, type Area, type Principal } from "./access";

const contextSchema = z.object({
  profileActive: z.boolean(), roles: z.array(z.enum(["OWNER", "ADMIN", "STAFF"])), staffActive: z.boolean(),
});

export async function getAccess() {
  const { supabase, user } = await readVerifiedUser();
  if (!user) return { supabase, principal: null };
  const { data: token, error: tokenError } = await supabase.auth.getClaims();
  if (tokenError || !token?.claims || token.claims.sub !== user.id) return { supabase, principal: null };
  const { data, error: contextError } = await supabase.rpc("get_access_context");
  if (contextError) throw new Error("Account access could not be checked. Please try again.");
  const context = contextSchema.parse(data);
  const principal: Principal = {
    ...context, userId: user.id, email: user.email ?? "",
    aal: token.claims.aal === "aal2" ? "aal2" : "aal1",
  };
  return { supabase, principal };
}

/** Call in EVERY protected page and action, not only shared layouts. */
export async function requireArea(area: Area) {
  const access = await getAccess();
  const decision = accessDecision(access.principal, area);
  if (decision === "login") redirect("/login");
  if (decision === "denied") redirect("/auth/access-denied");
  if (decision === "mfa") redirect("/auth/mfa");
  return { supabase: access.supabase, principal: access.principal! };
}

export async function requireOwner() {
  const access = await requireArea("admin");
  if (!access.principal.roles.includes("OWNER")) redirect("/auth/access-denied");
  return access;
}

export async function redirectAfterLogin(next?: string | null): Promise<never> {
  const { principal } = await getAccess();
  if (!principal) redirect("/login");
  const destination = safeAppointmentDestination(next);
  if (destination?.startsWith("/account/appointments/") && !principal.roles.includes("OWNER") && !principal.roles.includes("ADMIN") && !principal.roles.includes("STAFF")) {
    redirect(destination);
  }
  if (destination?.startsWith("/admin/appointments/") && principal.roles.some(role => role === "OWNER" || role === "ADMIN")) {
    redirect(principal.aal === "aal2" ? destination : `/auth/mfa?next=${encodeURIComponent(destination)}`);
  }
  if (destination?.startsWith("/staff/appointments?") && principal.roles.includes("STAFF") && principal.staffActive) {
    redirect(destination);
  }
  redirect(landingPath(principal));
}
