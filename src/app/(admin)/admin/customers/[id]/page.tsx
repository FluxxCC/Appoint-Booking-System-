import { CustomerPage } from "@/features/admin/pages";
import type { SearchParams } from "@/features/admin/data.server";
export default async function Page({ params, searchParams }: { params: Promise<{id:string}>; searchParams: Promise<SearchParams> }) {
  return <CustomerPage id={(await params).id} search={await searchParams} />;
}
