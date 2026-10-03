import "server-only";

import { createResendSender } from "./client";
import type { EmailDeliveryResult } from "./types";

/** Never import from a Client Component or browser bundle. */
export async function sendTransactionalEmail(input: unknown): Promise<EmailDeliveryResult> {
  return createResendSender({
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.RESEND_FROM_EMAIL,
    endpoint: process.env.PLAYWRIGHT_TEST === "1" ? process.env.E2E_RESEND_URL : undefined,
  })(input);
}
