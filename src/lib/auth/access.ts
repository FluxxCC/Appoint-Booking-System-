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

const idPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

/** Strict same-origin destinations supported by appointment email links. */
export function safeAppointmentDestination(value: string | null | undefined): string | null {
  if (!value || value.length > 512 || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  const match = new RegExp(`^/account/appointments/(${idPattern})$`, "i").exec(value);
  if (match) return `/account/appointments/${match[1]}`;
  const admin = new RegExp(`^/admin/appointments/(${idPattern})$`, "i").exec(value);
  if (admin) return `/admin/appointments/${admin[1]}`;
  const staff = new RegExp(`^/staff/appointments\\?focus=(${idPattern})#appointment-(${idPattern})$`, "i").exec(value);
  if (staff && staff[1].toLowerCase() === staff[2].toLowerCase()) {
    return `/staff/appointments?focus=${staff[1]}#appointment-${staff[2]}`;
  }
  return null;
}
