import { StaffLoginAccessPanel } from "@/features/staff/staff-login-access-panel";
import { readOwnerStaffLoginAccess } from "@/features/staff/staff-login-access.server";
import { PageHeading } from "@/features/admin/ui";

export default async function StaffAccountsPage() {
  const rows = await readOwnerStaffLoginAccess();
  return <section>
    <PageHeading title="Staff login access" description="Staff profiles are separate from login accounts. Keep a team member bookable without a login, or invite or connect an account when they need the staff portal."/>
    <StaffLoginAccessPanel rows={rows}/>
  </section>;
}
