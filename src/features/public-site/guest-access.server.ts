import "server-only";
import { z } from "zod";
import { createPrivilegedClient } from "@/lib/supabase/privileged.server";
import { siteUrl } from "@/lib/auth/site-url.server";
import { sendTransactionalEmail } from "@/server/email/send-email";
import { renderGuestAccessEmail } from "@/server/email/templates";
import type { EmailDeliveryResult } from "@/server/email/types";

const issuedLink = z.object({ appointment_id: z.uuid(), token: z.string().regex(/^[A-Za-z0-9_-]{40,60}$/) });
export type GuestEmailResult = EmailDeliveryResult | { ok: false; code: "no_matching_guest"; retryable: false };

export async function emailGuestAccess(input: { email: string; reference?: string; appointmentId?: string }): Promise<GuestEmailResult> {
  // Avoid leaving an undeliverable access credential in the database.
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return { ok: false, code: "not_configured", retryable: false };
  const supabase = createPrivilegedClient();
  const { data, error } = await supabase.rpc("issue_guest_access_link", {
    p_email: input.email.trim().toLowerCase(),
    p_reference: input.reference ?? null,
    p_appointment: input.appointmentId ?? null,
  });
  const parsed = issuedLink.safeParse(data);
  if (error || !parsed.success) return { ok: false, code: "no_matching_guest", retryable: false };
  const { data: booking, error: referenceError } = await supabase.from("appointments")
    .select("public_reference").eq("id", parsed.data.appointment_id).maybeSingle();
  if (referenceError || !booking?.public_reference) return { ok: false, code: "provider_error", retryable: true };
  const { data: business, error: businessError } = await supabase.from("business_settings").select("name").maybeSingle();
  if (businessError || !business) return { ok: false, code: "provider_error", retryable: true };
  // The fragment is never sent to the web server in a GET request. The access
  // page removes it before exchanging the one-time credential in a POST.
  const url = `${siteUrl()}/booking/access#token=${encodeURIComponent(parsed.data.token)}`;
  return sendTransactionalEmail(renderGuestAccessEmail({
    to: input.email,
    reference: booking.public_reference,
    bookingUrl: url,
    businessName: business.name,
  }));
}
