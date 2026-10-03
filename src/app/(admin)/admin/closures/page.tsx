import { ClosuresPage } from "@/features/admin/pages";
import type { SearchParams } from "@/features/admin/data.server";
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <ClosuresPage search={await searchParams} />;
}
