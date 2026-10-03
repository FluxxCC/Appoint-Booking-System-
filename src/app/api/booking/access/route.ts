import { createHash } from "node:crypto";
import { createPrivilegedClient } from "@/lib/supabase/privileged.server";
import { consumeRateLimit, trustedClientIdentifier } from "@/features/availability/rate-limit.server";
import { guestLinkPattern, inspectGuestLink, setGuestBookingCookie } from "@/features/public-site/guest-link.server";

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

export async function POST(request: Request) {
  const decision = await consumeRateLimit("guestAccess", trustedClientIdentifier(request.headers));
  if (!decision.allowed) return Response.json({ status: "unavailable" }, { status: decision.unavailable ? 503 : 429, headers: privateHeaders });
  const body: unknown = await request.json().catch(() => null);
  const token = body && typeof body === "object" && "token" in body ? (body as { token?: unknown }).token : null;
  if (typeof token !== "string" || !guestLinkPattern.test(token))
    return Response.json({ status: "invalid" }, { status: 400, headers: privateHeaders });
  const hash = createHash("sha256").update(token).digest("hex");
  try {
    const { data, error } = await createPrivilegedClient().rpc("exchange_guest_access_link", { p_token_hash: hash });
    const result = data as { appointment_id?: unknown; guest_token?: unknown } | null;
    if (error) return Response.json({ status: "unavailable" }, { status: 503, headers: privateHeaders });
    if (typeof result?.appointment_id !== "string" || typeof result.guest_token !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(result.appointment_id) || !/^[A-Za-z0-9_-]{40,60}$/.test(result.guest_token))
      return Response.json(await inspectGuestLink(token), { status: 400, headers: privateHeaders });
    await setGuestBookingCookie(result.appointment_id, result.guest_token);
    return Response.json({ appointmentId: result.appointment_id }, { headers: privateHeaders });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers: privateHeaders });
  }
}
