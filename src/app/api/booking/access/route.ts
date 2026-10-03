import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { createPrivilegedClient } from "@/lib/supabase/privileged.server";
import { consumeRateLimit, trustedClientIdentifier } from "@/features/availability/rate-limit.server";

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

export async function POST(request: Request) {
  const decision = await consumeRateLimit("recovery", trustedClientIdentifier(request.headers));
  if (!decision.allowed) return Response.json({ error: "Private access is temporarily unavailable." }, { status: 429, headers: privateHeaders });
  const body: unknown = await request.json().catch(() => null);
  const token = body && typeof body === "object" && "token" in body ? (body as { token?: unknown }).token : null;
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{40,60}$/.test(token))
    return Response.json({ error: "This link is invalid or expired." }, { status: 400, headers: privateHeaders });
  const hash = createHash("sha256").update(token).digest("hex");
  try {
    const { data, error } = await createPrivilegedClient().rpc("exchange_guest_access_link", { p_token_hash: hash });
    const result = data as { appointment_id?: unknown; guest_token?: unknown } | null;
    if (error || typeof result?.appointment_id !== "string" || typeof result.guest_token !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(result.appointment_id) || !/^[A-Za-z0-9_-]{40,60}$/.test(result.guest_token))
      return Response.json({ error: "This link is invalid or expired." }, { status: 400, headers: privateHeaders });
    (await cookies()).set(`guest_booking_${result.appointment_id}`, result.guest_token,
      { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return Response.json({ appointmentId: result.appointment_id }, { headers: privateHeaders });
  } catch {
    return Response.json({ error: "Private access is temporarily unavailable." }, { status: 503, headers: privateHeaders });
  }
}
