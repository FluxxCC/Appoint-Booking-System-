import { notFound } from "next/navigation";
import { SettingsPage } from "@/features/admin/pages";

const sections = new Set(["profile", "booking", "policies", "hours", "home-service"]);

export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.has(section)) notFound();
  return <SettingsPage section={section} />;
}
