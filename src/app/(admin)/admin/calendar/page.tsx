import { CalendarPage } from "@/features/admin/calendar";
import type { SearchParams } from "@/features/admin/data.server";
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <CalendarPage search={await searchParams} />;
}
