import { StaffAppointmentsPage } from "@/features/catalog/staff-workspace";

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  const { focus } = await searchParams;
  return <StaffAppointmentsPage focusId={focus}/>;
}
