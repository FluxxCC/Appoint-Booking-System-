import { AppointmentsPage } from "@/features/admin/pages";
import type { SearchParams } from "@/features/admin/data.server";
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <AppointmentsPage search={await searchParams} />;
}
