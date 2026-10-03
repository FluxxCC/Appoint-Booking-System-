import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { createPrivilegedClient } from "@/lib/supabase/privileged.server";
import { readGuestBooking } from "./booking-data.server";

export const guestLinkPattern = /^[A-Za-z0-9_-]{40,60}$/;
export type GuestLinkStatus = "ready" | "used" | "expired" | "invalid" | "authorized";

export async function inspectGuestLink(token: string): Promise<{ status: GuestLinkStatus; appointmentId?: string }> {
  if (!guestLinkPattern.test(token)) return { status: "invalid" };
  const hash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await createPrivilegedClient().from("guest_access_tokens")
    .select("appointment_id,expires_at,consumed_at,revoked_at")
    .eq("token_hash", hash).eq("scope", "MANAGE").maybeSingle();
  if (error) throw error;
  if (!data) return { status: "invalid" };
  if (data.revoked_at) return { status: "invalid" };
  if (data.consumed_at) {
    const booking = await readGuestBooking(data.appointment_id);
    return booking ? { status: "authorized", appointmentId: data.appointment_id } : { status: "used" };
  }
  if (Date.parse(data.expires_at) <= Date.now()) return { status: "expired" };
  return { status: "ready" };
}

export async function setGuestBookingCookie(appointmentId: string, token: string) {
  (await cookies()).set(`guest_booking_${appointmentId}`, token,
    { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
}
