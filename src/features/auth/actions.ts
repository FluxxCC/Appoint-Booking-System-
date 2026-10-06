"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess, requireArea, redirectAfterLogin } from "@/lib/auth/access.server";
import type { AppRole } from "@/lib/auth/access";
import { siteUrl } from "@/lib/auth/site-url.server";
import { emailSchema, loginSchema, registrationSchema, resetSchema, customerProfileSchema, validationState, type FormState } from "./schemas";
import { provisionVerifiedCustomer } from "./provision-customer.server";

export async function loginAction(_previous: FormState, form: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return validationState(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.code === "email_not_confirmed" ? "Verify your email before signing in. Check your inbox and spam folder." : "Unable to sign in. Check your credentials or try again later." };
  const access = await getAccess().catch(() => ({ principal: null }));
  if (!access.principal || access.principal.roles.length > 0) {
    await supabase.auth.signOut({ scope: "local" });
    revalidatePath("/", "layout");
    return { error: access.principal?.roles.length
      ? "This is customer sign-in. Use the Owner, Admin, or Staff sign-in page for your work account."
      : "Your account access could not be verified. Please try again." };
  }
  revalidatePath("/", "layout");
  return redirectAfterLogin(String(form.get("next") ?? ""));
}

async function workspaceLoginAction(role: AppRole, _previous: FormState, form: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return validationState(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.code === "email_not_confirmed" ? "Verify your email before signing in. Check your inbox and spam folder." : "Unable to sign in. Check your credentials or try again later." };

  const access = await getAccess().catch(() => ({ principal: null }));
  const principal = access.principal;
  // Owners are also administrators for appointment operations, so links to
  // admin appointment routes must remain usable from the owner portal.
  const hasRole = principal?.profileActive && (role === "ADMIN"
    ? principal.roles.some(assigned => assigned === "OWNER" || assigned === "ADMIN")
    : principal.roles.includes(role)) && (role !== "STAFF" || principal.staffActive);
  if (!hasRole) {
    await supabase.auth.signOut({ scope: "local" });
    revalidatePath("/", "layout");
    return { error: "This account is not assigned to this workspace. Check that you chose the correct sign-in or contact the business owner." };
  }

  revalidatePath("/", "layout");
  return redirectAfterLogin(String(form.get("next") ?? ""));
}

export async function ownerLoginAction(previous: FormState, form: FormData): Promise<FormState> {
  return workspaceLoginAction("OWNER", previous, form);
}

export async function adminLoginAction(previous: FormState, form: FormData): Promise<FormState> {
  return workspaceLoginAction("ADMIN", previous, form);
}

export async function staffLoginAction(previous: FormState, form: FormData): Promise<FormState> {
  return workspaceLoginAction("STAFF", previous, form);
}

export async function registerAction(_previous: FormState, form: FormData): Promise<FormState> {
  // Explicit allowlist: roles and user IDs never enter signup payloads.
  const parsed = registrationSchema.safeParse({ fullName: form.get("fullName"), email: form.get("email"), password: form.get("password"), phone: form.get("phone") ?? "" });
  if (!parsed.success) return validationState(parsed.error);
  const value = parsed.data;
  const supabase = await createClient();
  const registration = await supabase.rpc("registration_enabled");
  if (registration.error || registration.data !== true) return { error: "Customer registration is currently unavailable. Please contact the business." };
  const { data, error } = await supabase.auth.signUp({
    email: value.email, password: value.password,
    options: { emailRedirectTo: `${siteUrl()}/auth/callback`, data: { full_name: value.fullName, phone: value.phone } },
  });
  if (error) return { error: error.code === "weak_password" ? "Choose a stronger password that meets the business's password policy." : "Unable to create an account. If you already registered, sign in or reset your password. Otherwise, try again later." };
  if (!data.session) return { success: "Check your email to verify your account. If you already have an account, sign in or reset your password." };
  const { error: profileError } = await supabase.rpc("complete_customer_profile", { p_name: value.fullName, p_phone: value.phone || undefined });
  if (profileError) redirect("/account/setup");
  revalidatePath("/", "layout");
  redirect("/account");
}

export async function forgotPasswordAction(_previous: FormState, form: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(form.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: `${siteUrl()}/auth/callback?next=/reset-password` });
  if (error) return { error: "Unable to request a reset right now. Please wait and try again." };
  return { success: "If this email has an account, a reset link will arrive shortly. Check your spam folder too." };
}

export async function resendConfirmationAction(_previous: FormState, form: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(form.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email: parsed.data, options: { emailRedirectTo: `${siteUrl()}/auth/callback` } });
  if (error) return { error: "Unable to request a verification email right now. Please wait and try again." };
  return { success: "If your account needs verification, a new email will arrive shortly." };
}

export async function resetPasswordAction(_previous: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireArea("account");
  const parsed = resetSchema.safeParse({ password: form.get("password"), confirmPassword: form.get("confirmPassword") });
  if (!parsed.success) return validationState(parsed.error);
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "Unable to change the password. Use a different strong password, or request a fresh reset link." };
  const { error: signoutError } = await supabase.auth.signOut({ scope: "global" });
  if (signoutError) return { success: "Password changed. Please sign out before signing in with your new password." };
  revalidatePath("/", "layout");
  redirect("/login?notice=password-updated");
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) redirect("/auth/error?reason=logout");
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function saveCustomerProfileAction(_previous: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireArea("account");
  const parsed = customerProfileSchema.safeParse({ fullName: form.get("fullName"), phone: form.get("phone") ?? "" });
  if (!parsed.success) return validationState(parsed.error);
  const { error } = await supabase.rpc("complete_customer_profile", { p_name: parsed.data.fullName, p_phone: parsed.data.phone || undefined });
  if (error) return { error: "Your profile could not be saved. Please try again." };
  revalidatePath("/account", "layout");
  redirect("/account");
}

export async function confirmEmailAction(_previous: FormState, form: FormData): Promise<FormState> {
  const tokenHash = form.get("token_hash");
  const type = form.get("type");
  if (typeof tokenHash !== "string" || tokenHash.length > 2048 || !tokenHash || (type !== "signup" && type !== "recovery" && type !== "invite")) return { error: "This link is invalid. Request a fresh email." };
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) return { error: "This link has expired or was already used. Request a fresh email." };
  revalidatePath("/", "layout");
  if (type === "recovery" || type === "invite") redirect("/reset-password");
  await provisionVerifiedCustomer(supabase);
  redirect("/account");
}
