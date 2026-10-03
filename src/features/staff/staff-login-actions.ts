"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/access.server";
import { createPrivilegedClient } from "@/lib/supabase/privileged.server";
import { siteUrl } from "@/lib/auth/site-url.server";
import type { FormState } from "@/features/auth/schemas";

const enableSchema = z.object({ staffId: z.uuid(), email: z.email().trim().max(254) });
const disableSchema = z.object({ staffId: z.uuid() });

export async function inviteStaffLoginAction(_state: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireOwner();
  const parsed = enableSchema.safeParse({ staffId: form.get("staffId"), email: form.get("email") });
  if (!parsed.success) return { error: "Enter a valid work email address." };

  try {
    const { data, error } = await createPrivilegedClient().auth.admin.inviteUserByEmail(parsed.data.email, {
      redirectTo: `${siteUrl()}/auth/confirm`,
    });
    if (error || !data.user) {
      return { error: "The invitation could not be sent. If this person already has an account, connect their existing account below." };
    }

    const { error: linkError } = await supabase.rpc("enable_staff_login", {
      p_staff: parsed.data.staffId,
      p_email: parsed.data.email,
    });
    revalidatePath("/admin/staff/accounts");
    if (linkError) {
      return { error: "The invitation was sent, but login access was not enabled. Review this staff profile and connect the invited account by email." };
    }
    return { success: "Invitation sent. Login access is enabled; the team member can confirm their email and choose their own password." };
  } catch {
    return { error: "Invitations are unavailable. Check the server-side account and email delivery configuration." };
  }
}

export async function connectStaffLoginAction(_state: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireOwner();
  const parsed = enableSchema.safeParse({ staffId: form.get("staffId"), email: form.get("email") });
  if (!parsed.success) return { error: "Enter the verified email address for this team member." };
  const { error } = await supabase.rpc("enable_staff_login", {
    p_staff: parsed.data.staffId,
    p_email: parsed.data.email,
  });
  if (error) return { error: "Login access could not be connected. Verify the email and make sure the account is not linked to a different staff profile." };
  revalidatePath("/admin/staff/accounts");
  return { success: "Login access connected to this staff profile." };
}

export async function disableStaffLoginAction(_state: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireOwner();
  const parsed = disableSchema.safeParse({ staffId: form.get("staffId") });
  if (!parsed.success) return { error: "Choose a valid staff profile." };
  const { error } = await supabase.rpc("disable_staff_login", { p_staff: parsed.data.staffId });
  if (error) return { error: "Login access could not be disabled. Reload the page and try again." };
  revalidatePath("/admin/staff/accounts");
  revalidatePath("/staff", "layout");
  return { success: "Login access disabled. The staff profile and its booking settings remain available." };
}
