"use server";
import "server-only";
import { headers } from "next/headers";
import { z } from "zod";
import { consumeRateLimit, trustedClientIdentifier } from "@/features/availability/rate-limit.server";
import { emailGuestAccess } from "./guest-access.server";

const input = z.object({ email: z.email().max(254), reference: z.string().trim().toUpperCase().regex(/^BK-[A-F0-9]{16}$/) });
export type RecoveryState = { error?: string; success?: string };
const genericSuccess = "If those details match a guest booking, a private access link will arrive shortly. Check your spam folder too.";

export async function requestGuestRecoveryAction(_previous: RecoveryState, form: FormData): Promise<RecoveryState> {
  const parsed = input.safeParse({ email: form.get("email"), reference: form.get("reference") });
  if (!parsed.success) return { error: "Enter a valid email address and booking reference." };
  const decision = await consumeRateLimit("recovery", trustedClientIdentifier(await headers()));
  if (!decision.allowed) return { error: decision.unavailable ? "Email access is temporarily unavailable. Please try again later." : "Too many requests. Please wait before trying again." };
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return { error: "Email access is not configured yet. Use your original booking browser or contact the business." };
  await emailGuestAccess({ email: parsed.data.email, reference: parsed.data.reference }).catch(() => null);
  return { success: genericSuccess };
}
