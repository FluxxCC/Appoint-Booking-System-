import { HomeServicePage } from "@/features/home-service/pages";
import type { SearchParams } from "@/features/admin/data.server";

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <HomeServicePage area="staff" search={await searchParams}/>;
}
