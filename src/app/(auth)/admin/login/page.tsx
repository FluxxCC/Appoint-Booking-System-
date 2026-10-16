import type { Metadata } from "next";
import { WorkspaceLogin } from "@/features/auth/workspace-login";

export const metadata: Metadata = { title: "Administrator sign in", robots: { index: false, follow: false } };

export default async function AdministratorLoginPage({ searchParams }: { searchParams: Promise<{ next?: string; notice?: string }> }) {
  const { next, notice } = await searchParams;
  return <WorkspaceLogin role="ADMIN" next={next} notice={notice} />;
}
