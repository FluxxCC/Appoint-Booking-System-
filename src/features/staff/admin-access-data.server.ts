import "server-only";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/access.server";

export type OwnerAdminAccount = {
  email: string;
  email_confirmed: boolean;
  active: boolean;
  is_administrator: boolean;
  status: "active" | "disabled" | "invited/unverified" | "invited/pending" | "verified/pending activation";
};

const accountListSchema = z.array(z.object({
  user_id: z.uuid(),
  email: z.email(),
  email_confirmed: z.boolean(),
  active: z.boolean(),
  role: z.literal("ADMIN").nullable(),
  status: z.enum(["active", "disabled", "invited/unverified", "invited/pending", "verified/pending activation"]),
}));

export async function readOwnerAdminAccounts() {
  const { supabase } = await requireOwner();
  const { data, error } = await supabase.rpc("manage_owner_admins", { p_action: "list" });
  if (error || !Array.isArray(data)) throw new Error("ADMIN accounts could not be loaded.");
  return accountListSchema.parse(data).map(({ user_id, role, ...account }) => {
    void user_id;
    return { ...account, is_administrator: role === "ADMIN" };
  });
}
