import { z } from "zod";

export const emailSchema = z.email("Enter a valid email address.").trim().max(254);
export const nameSchema = z.string().trim().min(2, "Enter your full name.").max(200);
export const phoneSchema = z.string().trim().regex(/^$|^\+?[0-9 ()-]{7,25}$/, "Enter a valid mobile number.");
export const passwordSchema = z.string().min(12, "Use at least 12 characters.").max(128, "Use no more than 128 characters.");
export const registrationSchema = z.object({ fullName: nameSchema, email: emailSchema, password: passwordSchema, phone: phoneSchema }).strict();
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password.").max(128) });
export const resetSchema = z.object({ password: passwordSchema, confirmPassword: z.string() })
  .refine(value => value.password === value.confirmPassword, { path: ["confirmPassword"], message: "Passwords must match." });
export const customerProfileSchema = z.object({ fullName: nameSchema, phone: phoneSchema });
export const invitationSchema = z.object({ fullName: nameSchema, email: emailSchema, slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens.") });
export type FormState = { error?: string; success?: string; fieldErrors?: Record<string, string[]> };
export function validationState(error: z.ZodError): FormState {
  return { error: "Please check the highlighted fields.", fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[]> };
}
