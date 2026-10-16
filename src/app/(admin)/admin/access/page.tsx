import { requireOwner } from "@/lib/auth/access.server";
import { readOwnerAdminAccounts } from "@/features/staff/admin-access-data.server";
import { AdminAccessPanel } from "@/features/staff/admin-access-panel";

export default async function AdminAccessPage() {
  await requireOwner();
  const access = await readOwnerAdminAccounts();
  return <AdminAccessPanel {...access} />;
}
