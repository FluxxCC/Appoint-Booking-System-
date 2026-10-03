"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireArea } from "@/lib/auth/access.server";
import type { Database } from "@/types/database.generated";
import type { FormState } from "@/features/auth/schemas";
import { dispatchNotificationsAfterCommit } from "@/server/email/post-commit.server";

const idSchema = z.uuid();
const reasonSchema = z.string().trim().min(10).max(1000);
type Client = SupabaseClient<Database>;

function failure(error: { code?: string; message: string } | null): FormState {
  if (!error) return {};
  if (error.code === "23P01" || /no longer available|slot|schedule|booking window|service is no longer/i.test(error.message))
    return { error: "This time is no longer available. Review the request and choose how to proceed." };
  if (error.code === "42501" || /not authorized|authentication required/i.test(error.message))
    return { error: "Your account cannot perform this action. Reload to check your current access." };
  if (/pending requests|Only pending/i.test(error.message))
    return { error: "This request has already changed. Reload to see its current status." };
  return { error: "The request could not be updated. Reload and try again." };
}

async function accept(client: Client, form: FormData): Promise<FormState> {
  const id = idSchema.safeParse(form.get("appointmentId"));
  if (!id.success) return { error: "Choose a valid appointment." };
  const { data, error } = await client.rpc("accept_appointment", { p_appointment: id.data });
  if (error) return failure(error);
  await dispatchNotificationsAfterCommit({ appointmentId: id.data, eventState: data });
  revalidatePath("/admin/appointments");
  revalidatePath(`/admin/appointments/${id.data}`);
  revalidatePath("/admin/calendar");
  revalidatePath("/staff");
  return { success: data === "AWAITING_PAYMENT" ? "Time reserved. Payment is now required by the displayed deadline." : "Time reserved and appointment confirmed." };
}

async function decline(client: Client, form: FormData): Promise<FormState> {
  const id = idSchema.safeParse(form.get("appointmentId"));
  const reason = reasonSchema.safeParse(form.get("reason"));
  if (!id.success) return { error: "Choose a valid appointment." };
  if (!reason.success) return { error: "Explain why the request is declined in at least 10 characters." };
  const { error } = await client.rpc("transition_appointment", {
    p_appointment: id.data, p_target: "DECLINED", p_reason: reason.data,
  });
  if (error) return failure(error);
  await dispatchNotificationsAfterCommit({ appointmentId: id.data, eventState: "DECLINED" });
  revalidatePath("/admin/appointments");
  revalidatePath(`/admin/appointments/${id.data}`);
  revalidatePath("/staff");
  return { success: "Request declined. The reason is saved in the appointment history." };
}

export async function acceptAsAdmin(_state: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireArea("admin");
  return accept(supabase, form);
}
export async function declineAsAdmin(_state: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireArea("admin");
  return decline(supabase, form);
}
export async function acceptAsStaff(_state: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireArea("staff");
  return accept(supabase, form);
}
export async function declineAsStaff(_state: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireArea("staff");
  return decline(supabase, form);
}

export async function advanceAsAdmin(_state: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireArea("admin");
  const id = idSchema.safeParse(form.get("appointmentId"));
  const target = z.enum(["CHECKED_IN","IN_PROGRESS","COMPLETED","NO_SHOW","CANCELLED"]).safeParse(form.get("target"));
  if (!id.success || !target.success) return { error: "Choose a valid appointment action." };
  const reason = String(form.get("reason") ?? "").trim();
  if (target.data === "CANCELLED" && !reason) return { error: "Give a reason for cancellation." };
  const { error } = await supabase.rpc("transition_appointment", {
    p_appointment: id.data, p_target: target.data, p_reason: reason || null,
  });
  if (error) return failure(error);
  await dispatchNotificationsAfterCommit({ appointmentId: id.data, eventState: target.data });
  revalidatePath("/admin/appointments");
  revalidatePath(`/admin/appointments/${id.data}`);
  revalidatePath("/admin/calendar");
  revalidatePath("/staff");
  return { success: "Appointment status updated." };
}
