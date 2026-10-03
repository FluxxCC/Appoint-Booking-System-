import { z } from "zod";

const safeEmail = z.email().max(254);

export function resolveCustomerEmail(input: {
  authUserId: string | null;
  storedEmail: string | null;
  linkedAuthEmail?: string | null;
  linkedAuthEmailConfirmed?: boolean;
  linkedProfileActive?: boolean;
}) {
  if (input.authUserId) {
    const email = input.linkedAuthEmail?.trim();
    return input.linkedProfileActive && input.linkedAuthEmailConfirmed && email && safeEmail.safeParse(email).success
      ? { email, guest: false }
      : null;
  }
  const email = input.storedEmail?.trim();
  return email && safeEmail.safeParse(email).success ? { email, guest: true } : null;
}

export function resolveStaffEmail(input: {
  authUserId: string | null;
  active: boolean;
  linkedAuthEmail?: string | null;
  linkedAuthEmailConfirmed?: boolean;
  linkedProfileActive?: boolean;
}) {
  const email = input.linkedAuthEmail?.trim();
  return input.authUserId && input.active && input.linkedProfileActive && input.linkedAuthEmailConfirmed
    && email && safeEmail.safeParse(email).success ? email : null;
}

export function operationalRecipientScope(state: string, approvalMode: string) {
  if (state !== "PENDING") return null;
  if (approvalMode === "ADMIN_APPROVAL") return "admin_ops" as const;
  if (approvalMode === "STAFF_APPROVAL") return "assigned_staff" as const;
  return null;
}
