"use server";
import "server-only";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { consumeRateLimit, trustedClientIdentifier } from "@/features/availability/rate-limit.server";
import { createPrivilegedClient } from "@/lib/supabase/privileged.server";
import { dispatchNotificationsAfterCommit } from "@/server/email/post-commit.server";

const input = z.object({ email: z.email().max(254), reference: z.string().trim().toUpperCase().regex(/^BK-[A-F0-9]{16}$/) });
export type RecoveryState = { error?: string; success?: string };
const genericSuccess = "If those details match a guest booking, a private access link will arrive shortly. Check your spam folder too.";

export async function requestGuestRecoveryAction(_previous: RecoveryState, form: FormData): Promise<RecoveryState> {
  const parsed = input.safeParse({ email: form.get("email"), reference: form.get("reference") });
  if (!parsed.success) return { error: "Enter a valid email address and booking reference." };
  const decision = await consumeRateLimit("recovery", trustedClientIdentifier(await headers()));
  if (!decision.allowed) return { error: decision.unavailable ? "Email access is temporarily unavailable. Please try again later." : "Too many requests. Please wait before trying again." };
  try {
    const { data, error } = await createPrivilegedClient().rpc("enqueue_guest_access_notification", {
      p_email: parsed.data.email.trim().toLowerCase(),
      p_reference: parsed.data.reference,
      p_request_id: randomUUID(),
    });
    if (!error && data === true) await dispatchNotificationsAfterCommit();
  } catch {
    // Keep the public response generic and preserve account-enumeration protection.
  }
  return { success: genericSuccess };
}
