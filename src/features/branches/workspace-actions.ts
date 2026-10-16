"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireArea } from "@/lib/auth/access.server";
import { workspaceBranchCookie } from "./workspace-context.server";

const branchChoice = z.union([z.literal("all"), z.uuid()]);

function safeReturnPath(value: unknown, area: "admin" | "staff") {
  if (typeof value !== "string" || value.length > 1200 || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  let url: URL;
  try { url = new URL(value, "https://workspace.invalid"); } catch { return null; }
  if (url.origin !== "https://workspace.invalid") return null;
  const prefix = area === "admin" ? "/admin" : "/staff";
  if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

export async function setWorkspaceBranchAction(_previous: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const returnTo = String(form.get("returnTo") ?? "");
  const area = returnTo === "/staff" || returnTo.startsWith("/staff/") || returnTo.startsWith("/staff?") ? "staff" : "admin";
  const safePath = safeReturnPath(returnTo, area);
  if (!safePath) return { error: "Choose a valid workspace page before switching branches." };

  const { supabase } = await requireArea(area);
  const parsed = branchChoice.safeParse(form.get("branch_id"));
  if (!parsed.success) return { error: "Choose a branch you are assigned to." };

  const selectedValue = parsed.data;
  if (selectedValue === "all") {
    const { data, error } = await supabase.from("branches").select("id").limit(2);
    if (error || (data?.length ?? 0) < 2) return { error: "All-branch view is unavailable for this account." };
  } else {
    const { data, error } = await supabase.from("branches").select("id").eq("id", selectedValue).maybeSingle();
    if (error || !data) return { error: "That branch is no longer available to your account." };
  }

  const cookieStore = await cookies();
  cookieStore.set(workspaceBranchCookie, selectedValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect(safePath);
}
