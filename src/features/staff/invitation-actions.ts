"use server";

import { z } from "zod";
import { requireOwner } from "@/lib/auth/access.server";
import { createPrivilegedClient } from "@/lib/supabase/privileged.server";
import { siteUrl } from "@/lib/auth/site-url.server";
import { invitationSchema, validationState, type FormState } from "@/features/auth/schemas";

export async function inviteStaffAction(_previous: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireOwner();
  const parsed = invitationSchema.safeParse({ fullName: form.get("fullName"), email: form.get("email"), slug: form.get("slug") });
  if (!parsed.success) return validationState(parsed.error);
  try {
    const { data, error } = await createPrivilegedClient().auth.admin.inviteUserByEmail(parsed.data.email, {
      redirectTo: `${siteUrl()}/auth/confirm`, data: { full_name: parsed.data.fullName },
    });
    if (error || !data.user) return { error: "The invitation could not be sent. Check the address and email configuration. For an existing account, use the controlled linking form below." };
    // Rechecks live owner/MFA authorization in the DB after the external Auth call.
    const { error: linkError } = await supabase.rpc("link_staff_account", { p_user: data.user.id, p_name: parsed.data.fullName, p_slug: parsed.data.slug });
    if (linkError) return { error: `The email was sent, but staff access was not linked. Verify the account in Supabase and use the linking form below with account ID ${data.user.id}. Check that the staff URL name is unique.` };
    return { success: "Invitation sent and STAFF access linked. The member can confirm the email, set a password and sign in. Existing profile settings are preserved; newly created profiles are unpublished and not bookable." };
  } catch { return { error: "Invitations are unavailable. Check the server-only Supabase secret, site URL and email delivery configuration." }; }
}

export async function linkExistingStaffAction(_previous: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireOwner();
  const parsed = invitationSchema.omit({ email: true }).extend({ userId: z.uuid("Enter the verified Auth account UUID.") })
    .safeParse({ fullName: form.get("fullName"), slug: form.get("slug"), userId: form.get("userId") });
  if (!parsed.success) return validationState(parsed.error);
  // The UUID is a target, never an authorization identity. The owner is from the verified session.
  const { error } = await supabase.rpc("link_staff_account", { p_user: parsed.data.userId, p_name: parsed.data.fullName, p_slug: parsed.data.slug });
  if (error) return { error: "Unable to link this account. Verify its Auth ID, active status and unique staff URL name. Existing admin/owner accounts require separate review." };
  return { success: "STAFF role and staff record linked. This does not send another email or change the user's password." };
}
