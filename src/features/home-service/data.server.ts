import "server-only";

import { z } from "zod";
import { resolveWorkspaceBranchContext } from "@/features/branches/workspace-context.server";
import type { SearchParams } from "@/features/admin/data.server";

const activeStates = ["PENDING", "ACCEPTED", "AWAITING_PAYMENT", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"] as const;
const filtersSchema = z.object({
  date: z.union([z.literal(""), z.iso.date()]).default(""),
  status: z.union([z.literal(""), z.enum(activeStates)]).default(""),
  staff: z.union([z.literal(""), z.uuid()]).default(""),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});

export type HomeServiceAppointment = {
  id: string;
  public_reference: string;
  customer_id: string;
  staff_id: string;
  branch_id: string;
  starts_at: string;
  ends_at: string;
  state: typeof activeStates[number];
  fulfillment_mode: "HOME_SERVICE";
  service_area_hint: string | null;
  home_service_fee_snapshot: string;
  total_amount: string;
  currency: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  staff_name: string;
  branch_name: string;
  timezone: string;
  service_name: string;
  address: string;
  latitude: string | null;
  longitude: string | null;
  landmark: string | null;
  instructions: string | null;
};

type HomeServiceResult = {
  active_count: number;
  total: number;
  page: number;
  appointments: HomeServiceAppointment[];
  staff_options: { id: string; display_name: string }[];
};

export async function readHomeServiceData(area: "admin" | "staff", search: SearchParams = {}) {
  const parsed = filtersSchema.safeParse({ date: search.date, status: search.status, staff: search.staff, page: search.page });
  if (!parsed.success) throw new Error("Invalid Home Service filters. Clear the filters and try again.");
  const { supabase, branchContext } = await resolveWorkspaceBranchContext(area);
  const { data, error } = await supabase.rpc("home_service_data_for_branch", {
    p_area: area,
    p_branch_id: branchContext.selectedBranchId,
    p_date: parsed.data.date || null,
    p_status: parsed.data.status,
    p_staff: area === "admin" && parsed.data.staff ? parsed.data.staff : null,
    p_page: parsed.data.page,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Home Service bookings could not be loaded. Check your branch access and database migration.");
  }
  const result = data as unknown as HomeServiceResult;
  return { ...result, filters: parsed.data, branchContext };
}

/** Keep the shared workspace shell available while a new database migration is pending. */
export async function readHomeServiceCount(area: "admin" | "staff"): Promise<number | null> {
  try {
    return (await readHomeServiceData(area)).active_count;
  } catch {
    return null;
  }
}
