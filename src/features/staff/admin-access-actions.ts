"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/access.server";
import { createPrivilegedClient } from "@/lib/supabase/privileged.server";
import { siteUrl } from "@/lib/auth/site-url.server";
import { emailSchema, type FormState } from "@/features/auth/schemas";


export async function inviteAdminAction(_state: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireOwner();
  const parsed = emailSchema.safeParse(form.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };

  try {
    const { data, error } = await createPrivilegedClient().auth.admin.inviteUserByEmail(parsed.data, {
      redirectTo: `${siteUrl()}/auth/confirm`,
    });
    if (error || !data.user) return { error: "The invitation could not be sent. Existing accounts can be granted ADMIN after their email is confirmed by entering their Auth user UUID below." };

    const { error: recordError } = await supabase.rpc("manage_owner_admins", {
      p_action: "record-invitation", p_user: data.user.id, p_email: parsed.data,
    });
    if (recordError) return { error: "The invitation was sent, but activation could not be prepared. Contact the owner before retrying this invitation." };
    revalidatePath("/admin/access");
    return { success: "Invitation sent. ADMIN access remains inactive until the recipient confirms their email and an owner activates the account." };
  } catch {
    return { error: "ADMIN invitations are unavailable. Check the server-only Supabase secret, site URL and email delivery configuration." };
  }
}

export async function grantAdminAction(_state: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireOwner();
  const parsed = emailSchema.safeParse(form.get("email"));
  if (!parsed.success) return { error: "Enter the confirmed email address for this administrator." };
  const { error } = await supabase.rpc("manage_admin_access_by_email", { p_action: "grant", p_email: parsed.data });
  if (error) return { error: "ADMIN access could not be granted. Verify the account is confirmed, active and has no conflicting staff or privileged identity." };
  revalidatePath("/admin/access");
  return { success: "ADMIN access granted. MFA is required before the account can enter /admin." };
}

export async function revokeAdminAction(_state: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireOwner();
  const parsed = emailSchema.safeParse(form.get("email"));
  if (!parsed.success) return { error: "Invalid administrator email." };
  const { error } = await supabase.rpc("manage_admin_access_by_email", { p_action: "revoke", p_email: parsed.data });
  if (error) return { error: "ADMIN access could not be revoked. Reload the account list and try again." };
  revalidatePath("/admin/access");
  return { success: "ADMIN role revoked." };
}
