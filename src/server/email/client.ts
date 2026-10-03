import "server-only";

import { z } from "zod";
import { transactionalEmailKinds, type EmailDeliveryResult, type TransactionalEmail } from "./types";

const emailInput = z.object({
  kind: z.enum(transactionalEmailKinds),
  to: z.email().trim().max(254),
  subject: z.string().trim().min(1).max(200),
  html: z.string().max(100_000).optional(),
  text: z.string().max(100_000).optional(),
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).optional(),
}).strict().refine(value => Boolean(value.html?.trim() || value.text?.trim()), {
  message: "Provide an HTML or text body.",
});

type SenderConfig = { apiKey?: string; from?: string; fetcher?: typeof fetch; endpoint?: string };

function parseSenderAddress(value: unknown): string | undefined {
  const parsed = z.string().trim().max(320).safeParse(value);
  if (!parsed.success) return undefined;

  const plainAddress = z.email().safeParse(parsed.data);
  if (plainAddress.success) return plainAddress.data;

  const displayAddress = /^([^<>]+?)\s*<([^<>]+)>$/.exec(parsed.data);
  if (!displayAddress) return undefined;

  const name = displayAddress[1].trim();
  const address = z.email().safeParse(displayAddress[2].trim());
  if (!name || /[\r\n]/.test(name) || !address.success) return undefined;
  return `${name} <${address.data}>`;
}

/** Constructed at request time so deployments can rotate configuration without a rebuild. */
export function createResendSender(config: SenderConfig) {
  const fetcher = config.fetcher ?? fetch;

  return async function send(input: unknown): Promise<EmailDeliveryResult> {
    const parsed = emailInput.safeParse(input);
    if (!parsed.success) return { ok: false, code: "invalid_input", retryable: false };
    const from = parseSenderAddress(config.from);
    if (!config.apiKey || !from) return { ok: false, code: "not_configured", retryable: false };

    const message: TransactionalEmail = parsed.data;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    };
    if (message.idempotencyKey) headers["Idempotency-Key"] = message.idempotencyKey;

    try {
      const response = await fetcher(config.endpoint ?? "https://api.resend.com/emails", {
        method: "POST",
        headers,
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          ...(message.html ? { html: message.html } : {}),
          ...(message.text ? { text: message.text } : {}),
        }),
        signal: AbortSignal.timeout(8_000),
      });

      if (!response.ok) {
        return { ok: false, code: "provider_error", retryable: response.status === 429 || response.status >= 500 };
      }
      const body: unknown = await response.json().catch(() => null);
      const id = z.object({ id: z.string().min(1).max(200) }).safeParse(body);
      return id.success
        ? { ok: true, id: id.data.id }
        : { ok: false, code: "provider_error", retryable: true };
    } catch {
      return { ok: false, code: "network_error", retryable: true };
    }
  };
}
