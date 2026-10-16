"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { decimalToInteger, currencyDigits } from "@/features/catalog/schemas";
import { requireOwner } from "@/lib/auth/access.server";
import type { Json } from "@/types/database.generated";
import type { FormState } from "@/features/auth/schemas";

export async function setBranchHomeServiceAction(_state: FormState, form: FormData): Promise<FormState> {
  const branchId = z.uuid().safeParse(form.get("branch_id"));
  if (!branchId.success) return { error: "Choose a branch." };
  const { supabase } = await requireOwner();
  const { error } = await supabase.rpc("owner_set_home_service_enabled", {
    p_branch: branchId.data, p_enabled: form.get("enabled") === "true",
  });
  if (error) return { error: "Home Service could not be changed. Reload and check your owner access." };
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/branches");
  revalidatePath("/admin/services");
  revalidatePath("/book");
  return { success: "Home Service setting saved." };
}

const bool = z.enum(["true", "false"]).transform(value => value === "true");
const optionalDecimal = z.string().trim().max(32).refine(value => value === "" || /^\d+(\.\d+)?$/.test(value), "Enter a non-negative amount.");
const branchFormSchema = z.object({
  branch_id: z.union([z.literal(""), z.uuid()]),
  expected_updated_at: z.string().max(80),
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().max(1000),
  contact_email: z.union([z.literal(""), z.email().max(254)]),
  contact_phone: z.string().trim().max(40).regex(/^[+0-9 ()-]*$/),
  timezone: z.string().trim().min(1).max(100),
  public_visible: bool,
  booking_enabled: bool,
  is_active: bool,
  approval_mode: z.enum(["ADMIN_APPROVAL", "STAFF_APPROVAL", "AUTO_CONFIRM"]),
  service_origin_latitude: optionalDecimal,
  service_origin_longitude: optionalDecimal,
  home_service_max_radius_km: optionalDecimal,
}).refine(values => (values.service_origin_latitude === "") === (values.service_origin_longitude === ""), {
  path: ["service_origin_longitude"], message: "Enter both Home Service coordinates, or leave both blank.",
});

function fields(form: FormData) {
  return Object.fromEntries([
    "branch_id", "expected_updated_at", "name", "address", "contact_email", "contact_phone", "timezone",
    "public_visible", "booking_enabled", "is_active", "approval_mode", "service_origin_latitude",
    "service_origin_longitude", "home_service_max_radius_km",
  ].map(key => [key, form.get(key) ?? ""]));
}

function validationError(error: z.ZodError): FormState {
  return { error: error.issues.map(issue => issue.message).join(" ") };
}

function refreshBranchViews() {
  revalidatePath("/admin/branches", "page");
  revalidatePath("/admin/services", "page");
  revalidatePath("/admin/staff", "page");
  revalidatePath("/admin/access", "page");
  revalidatePath("/admin", "layout");
  revalidatePath("/", "page");
}

export async function saveBranchAction(_state: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireOwner();
  const parsed = branchFormSchema.safeParse(fields(form));
  if (!parsed.success) return validationError(parsed.error);
  const value = parsed.data;
  let slug: string;
  if (value.branch_id) {
    const { data: existing, error: lookupError } = await supabase.from("branches").select("slug").eq("id", value.branch_id).maybeSingle();
    if (lookupError || !existing) return { error: "This location could not be loaded. Refresh the page and try again." };
    slug = existing.slug;
  } else {
    const base = value.name.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80).replace(/-$/g, "") || "location";
    slug = "";
    for (let suffix = 1; suffix <= 1000; suffix += 1) {
      const candidate = suffix === 1 ? base : `${base.slice(0, 95 - String(suffix).length).replace(/-$/g, "")}-${suffix}`;
      const { data: existing, error: lookupError } = await supabase.from("branches").select("slug").eq("slug", candidate).maybeSingle();
      if (lookupError) return { error: "A booking link could not be prepared. Refresh and try again." };
      if (!existing) { slug = candidate; break; }
    }
    if (!slug) return { error: "A booking link could not be generated. Try a more specific location name." };
  }
  const payload = {
    name: value.name,
    slug,
    address: value.address || null,
    contact_email: value.contact_email || null,
    contact_phone: value.contact_phone || null,
    timezone: value.timezone,
    public_visible: value.public_visible,
    booking_enabled: value.booking_enabled,
    is_active: value.is_active,
    approval_mode: value.approval_mode,
    service_origin_latitude: value.service_origin_latitude === "" ? null : Number(value.service_origin_latitude),
    service_origin_longitude: value.service_origin_longitude === "" ? null : Number(value.service_origin_longitude),
    home_service_max_radius_km: value.home_service_max_radius_km === "" ? null : Number(value.home_service_max_radius_km),
  };
  const { error } = await supabase.rpc("owner_save_branch", {
    p_branch: value.branch_id || null,
    p_expected_updated_at: value.expected_updated_at || null,
    p_values: payload as unknown as Json,
  });
  if (error?.code === "23505") return { error: "A location with a similar name already uses that booking link. Add another word to the location name and try again." };
  if (error?.code === "40001") return { error: "This branch changed in another session. Reload and review the latest values before saving." };
  if (error?.code === "55000") return { error: error.message };
  if (error) return { error: "Branch details could not be saved. Check the fields and try again." };

  refreshBranchViews();
  return { success: value.branch_id ? "Branch details saved." : "Draft branch created. It is not active or bookable yet." };
}

export async function deleteEmptyBranchAction(_state: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireOwner();
  const branchId = z.uuid().safeParse(form.get("branch_id"));
  if (!branchId.success) return { error: "Choose a branch." };

  const { error } = await supabase.rpc("owner_delete_empty_branch", { p_branch: branchId.data });
  if (error?.code === "42501") return { error: "Only an OWNER with verified access can delete a branch." };
  if (error?.code === "P0002") return { error: "This branch no longer exists. Refresh the page and try again." };
  if (error?.code === "PGRST202") return { error: "Branch deletion is unavailable until the database migration has been applied." };
  if (error?.code === "55000" || error?.code === "23503") {
    return { error: "Only an unpublished, inactive draft with no bookings or setup history can be deleted. Its records must stay attached to the branch." };
  }
  if (error) return { error: "This branch could not be deleted. Refresh the page and check your owner access." };

  refreshBranchViews();
  return { success: "Empty draft branch deleted. Its audit history has been retained." };
}

const assignmentSchema = z.object({ branch_id: z.uuid(), target_id: z.uuid(), active: z.enum(["true", "false"]).transform(value => value === "true") });

export async function saveAdminBranchMembershipAction(_state: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireOwner();
  const parsed = assignmentSchema.safeParse({ branch_id: form.get("branch_id"), target_id: form.get("target_id"), active: form.get("active") });
  if (!parsed.success) return validationError(parsed.error);
  const { branch_id: branchId, target_id: userId, active } = parsed.data;
  const existing = await supabase.from("admin_branch_memberships").select("id,active")
    .eq("branch_id", branchId).eq("auth_user_id", userId).maybeSingle();
  if (existing.error) return { error: "Administrator branch access could not be checked. Reload and try again." };
  if (!existing.data && !active) return { success: "Administrator access is already off for this branch." };
  const result = existing.data
    ? await supabase.from("admin_branch_memberships").update({ active }).eq("id", existing.data.id).select("id").maybeSingle()
    : await supabase.from("admin_branch_memberships").insert({ branch_id: branchId, auth_user_id: userId, active: true }).select("id").maybeSingle();
  if (result.error || !result.data) return { error: "Access could not be changed. Only an active ADMIN role can receive branch membership." };
  refreshBranchViews();
  return { success: active ? "Administrator assigned to this branch." : "Administrator branch access removed." };
}

export async function saveStaffBranchAssignmentAction(_state: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireOwner();
  const parsed = assignmentSchema.safeParse({ branch_id: form.get("branch_id"), target_id: form.get("target_id"), active: form.get("active") });
  if (!parsed.success) return validationError(parsed.error);
  const { branch_id: branchId, target_id: staffId, active } = parsed.data;
  const existing = await supabase.from("staff_branch_assignments").select("id,active")
    .eq("branch_id", branchId).eq("staff_id", staffId).maybeSingle();
  if (existing.error) return { error: "Staff assignment could not be checked. Reload and try again." };
  if (!existing.data && !active) return { success: "Staff is already unassigned from this branch." };
  const result = existing.data
    ? await supabase.from("staff_branch_assignments").update({ active }).eq("id", existing.data.id).select("id").maybeSingle()
    : await supabase.from("staff_branch_assignments").insert({ branch_id: branchId, staff_id: staffId, active: true }).select("id").maybeSingle();
  if (result.error || !result.data) {
    return { error: "Assignment could not be changed. Resolve future appointments before removing a staff member." };
  }
  refreshBranchViews();
  revalidatePath("/staff", "layout");
  return { success: active ? "Staff assigned to this branch." : "Staff assignment removed." };
}

const serviceSchema = z.object({
  branch_id: z.uuid(), service_id: z.uuid(), active: bool, price_override: optionalDecimal,
});

export async function saveBranchServiceAction(_state: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireOwner();
  const parsed = serviceSchema.safeParse({
    branch_id: form.get("branch_id"), service_id: form.get("service_id"),
    active: form.get("active"), price_override: form.get("price_override") ?? "",
  });
  if (!parsed.success) return validationError(parsed.error);
  const { data: business, error: businessError } = await supabase.from("business_settings").select("currency").eq("singleton", true).maybeSingle();
  if (businessError || !business) return { error: "Business currency could not be loaded. Reload and try again." };
  let priceOverride: number | null = null;
  try {
    if (parsed.data.price_override) priceOverride = decimalToInteger(parsed.data.price_override, currencyDigits(business.currency));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Enter a valid service price." };
  }
  const { branch_id: branchId, service_id: serviceId, active } = parsed.data;
  const current = await supabase.from("branch_services").select("branch_id")
    .eq("branch_id", branchId).eq("service_id", serviceId).maybeSingle();
  if (current.error) return { error: "The branch service could not be checked. Reload and try again." };
  const result = current.data
    ? await supabase.from("branch_services").update({ active, price_override: priceOverride })
      .eq("branch_id", branchId).eq("service_id", serviceId).select("branch_id").maybeSingle()
    : await supabase.from("branch_services").insert({ branch_id: branchId, service_id: serviceId, active, price_override: priceOverride })
      .select("branch_id").maybeSingle();
  if (result.error || !result.data) return { error: "Service settings could not be saved. Check the price against its payment or deposit requirements." };
  refreshBranchViews();
  return { success: "Branch service settings saved." };
}
