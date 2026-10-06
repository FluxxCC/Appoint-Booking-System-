import type { Metadata } from "next";
import { WorkspaceLogin } from "@/features/auth/workspace-login";

export const metadata: Metadata = { title: "Staff sign in", robots: { index: false, follow: false } };

export default async function StaffLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <WorkspaceLogin role="STAFF" next={next} />;
}
