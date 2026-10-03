export type AppRole = "OWNER" | "ADMIN" | "STAFF";
export type Area = "admin" | "staff" | "account";
export type Principal = {
  userId: string;
  email: string;
  profileActive: boolean;
  roles: AppRole[];
  staffActive: boolean;
  aal: "aal1" | "aal2";
};

export function accessDecision(principal: Principal | null, area: Area): "allow" | "login" | "denied" | "mfa" {
  if (!principal) return "login";
  if (!principal.profileActive) return "denied";
  if (area === "admin") {
    if (!principal.roles.some(role => role === "OWNER" || role === "ADMIN")) return "denied";
    return principal.aal === "aal2" ? "allow" : "mfa";
  }
  if (area === "staff" && !(principal.roles.includes("STAFF") && principal.staffActive)) return "denied";
  return "allow";
}

export function landingPath(principal: Principal): string {
  if (!principal.profileActive) return "/auth/access-denied";
  if (principal.roles.some(role => role === "OWNER" || role === "ADMIN")) return principal.aal === "aal2" ? "/admin" : "/auth/mfa";
  if (principal.roles.includes("STAFF")) return principal.staffActive ? "/staff" : "/auth/access-denied";
  return "/account";
}

export function safeAuthDestination(value: string | null | undefined): string {
  return ["/account", "/admin", "/staff", "/reset-password"].includes(value ?? "") ? value! : "/account";
}
