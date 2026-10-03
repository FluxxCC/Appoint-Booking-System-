import "server-only";
import { createPayMongoProvider, PayMongoConfigurationError, PayMongoWebhookVerificationError } from "@/lib/payments/paymongo.server";
import { PayMongoEventNotMatchedError, settlePayMongoPayment } from "@/lib/payments/paymongo-settlement.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(status: number) {
  return Response.json(status >= 400 ? { error: "Webhook could not be processed." } : { received: true }, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 262_144) return json(413);
  let rawBody: Uint8Array;
  try { rawBody = new Uint8Array(await request.arrayBuffer()); }
  catch { return json(400); }
  if (rawBody.byteLength === 0 || rawBody.byteLength > 262_144) return json(413);

  try {
    const verified = await createPayMongoProvider().verifyWebhook(rawBody, request.headers);
    if ("ignored" in verified) return json(200);
    await settlePayMongoPayment(verified);
    return json(200);
  } catch (error) {
    if (error instanceof PayMongoConfigurationError) return json(503);
    if (error instanceof PayMongoWebhookVerificationError) return json(401);
    if (error instanceof PayMongoEventNotMatchedError) return json(409);
    return json(500);
  }
}
