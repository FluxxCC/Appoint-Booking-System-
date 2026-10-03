import "server-only";

import { z } from "zod";
import { requireOwner } from "@/lib/auth/access.server";

const staffAccessSchema = z.array(z.object({
  staff_id: z.uuid(),
  display_name: z.string(),
  active: z.boolean(),
  bookable: z.boolean(),
  login_enabled: z.boolean(),
  email: z.string().nullable(),
}));

export async function readOwnerStaffLoginAccess() {
  const { supabase } = await requireOwner();
  const { data, error } = await supabase.rpc("owner_staff_access");
  if (error) throw new Error("Staff login access could not be loaded.");
  return staffAccessSchema.parse(data);
}
