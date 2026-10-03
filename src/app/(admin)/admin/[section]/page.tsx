import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth/access.server";
import { navigation } from "@/components/layout/navigation";
import { ComingSoon } from "@/components/ui/coming-soon";

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  await requireArea("admin");
  const { section } = await params;
  const item = navigation.admin.find(entry => entry.href === `/admin/${section}`);
  if (!item) notFound();
  return <ComingSoon title={item.label} description={item.description} />;
}
