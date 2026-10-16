import "server-only";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/access.server";

export type OwnerAdminAccount = {
  user_id: string;
  email: string;
  email_confirmed: boolean;
  active: boolean;
  is_administrator: boolean;
  status: "active" | "disabled" | "invited/unverified" | "invited/pending" | "verified/pending activation";
};

export type OwnerBranchAccess = {
  branches: { id: string; name: string; is_default: boolean }[];
  memberships: { branch_id: string; auth_user_id: string; active: boolean }[];
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
  const [adminsResult, branchesResult, membershipsResult] = await Promise.all([
    supabase.rpc("manage_owner_admins", { p_action: "list" }),
    supabase.from("branches").select("id,name,is_default").order("is_default", { ascending: false }).order("name"),
    supabase.from("admin_branch_memberships").select("branch_id,auth_user_id,active"),
  ]);
  if (adminsResult.error || !Array.isArray(adminsResult.data) || branchesResult.error || membershipsResult.error) {
    throw new Error("ADMIN access could not be loaded.");
  }
  const accounts = accountListSchema.parse(adminsResult.data).map(({ role, ...account }) => ({
    ...account, is_administrator: role === "ADMIN",
  }));
  return {
    accounts,
    branches: (branchesResult.data ?? []) as OwnerBranchAccess["branches"],
    memberships: (membershipsResult.data ?? []) as OwnerBranchAccess["memberships"],
  } satisfies OwnerBranchAccess & { accounts: OwnerAdminAccount[] };
}
