import { consumeRateLimit, trustedClientIdentifier } from "@/features/availability/rate-limit.server";
import { guestLinkPattern, inspectGuestLink } from "@/features/public-site/guest-link.server";

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

export async function POST(request: Request) {
  const decision = await consumeRateLimit("guestAccess", trustedClientIdentifier(request.headers));
  if (!decision.allowed) return Response.json({ status: "unavailable" }, { status: decision.unavailable ? 503 : 429, headers: privateHeaders });
  const body: unknown = await request.json().catch(() => null);
  const token = body && typeof body === "object" && "token" in body ? (body as { token?: unknown }).token : null;
  if (typeof token !== "string" || !guestLinkPattern.test(token)) return Response.json({ status: "invalid" }, { headers: privateHeaders });
  try {
    return Response.json(await inspectGuestLink(token), { headers: privateHeaders });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers: privateHeaders });
  }
}
