import "server-only";
import { z } from "zod";
import { startPaymentCheckout } from "@/lib/payments/checkout.server";
import { createPayMongoProvider, isPayMongoTestConfigured } from "@/lib/payments/paymongo.server";
import { consumeRateLimit, trustedClientIdentifier } from "@/features/availability/rate-limit.server";
import { siteUrl } from "@/lib/auth/site-url.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const appointmentIdSchema = z.uuid();

function returnTo(request: Request, result: string, status = 303) {
  const target = new URL("/payment/return", request.url);
  target.searchParams.set("result", result);
  return new Response(null, { status, headers: { Location: target.toString(), "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  try {
    if (!origin || origin === "null" || origin !== siteUrl()) {
      return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
    }
  } catch {
    return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  const limit = await consumeRateLimit("checkout", trustedClientIdentifier(request.headers));
  if (!limit.allowed) {
    const response = returnTo(request, limit.unavailable ? "unavailable" : "try-again");
    response.headers.set("Retry-After", String(limit.retryAfterSeconds));
    return response;
  }
  if (!isPayMongoTestConfigured()) return returnTo(request, "unavailable");

  try {
    if (Number(request.headers.get("content-length") ?? 0) > 8_192) return returnTo(request, "unavailable");
    const form = await request.formData();
    const parsedId = appointmentIdSchema.safeParse(form.get("appointmentId"));
    if (!parsedId.success) return returnTo(request, "unavailable");
    const checkout = await startPaymentCheckout(parsedId.data, createPayMongoProvider());
    const checkoutUrl = new URL(checkout.checkoutUrl);
    if (checkoutUrl.protocol !== "https:" || checkoutUrl.hostname !== "checkout.paymongo.com") {
      return returnTo(request, "unavailable");
    }
    if (request.headers.get("accept")?.includes("application/json")) {
      return Response.json({ checkoutUrl: checkoutUrl.toString() }, {
        headers: { "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer" },
      });
    }
    return new Response(null, {
      status: 303,
      headers: { Location: checkoutUrl.toString(), "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer" },
    });
  } catch {
    return returnTo(request, "unavailable");
  }
}
