import { NextResponse } from "next/server";
import { z } from "zod";
import { createPrivilegedClient } from "@/lib/supabase/privileged.server";
import { readVerifiedUser } from "@/lib/auth/require-user.server";
import { getAccess } from "@/lib/auth/access.server";
import { hasVerifiedCustomerAccount } from "@/features/auth/has-customer-account.server";
import { resolveWorkspaceBranchContext } from "@/features/branches/workspace-context.server";
import { availabilityInput } from "@/features/availability/schemas";
import { consumeRateLimit, trustedClientIdentifier } from "@/features/availability/rate-limit.server";

export const dynamic = "force-dynamic";
const slug = z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const homeAvailabilityInput = z.object({
  branch: slug, service: z.uuid(), date: z.iso.date(), staff: z.union([z.literal(""), z.uuid(), z.null()]).default(""),
  fulfillment: z.enum(["BUSINESS_LOCATION", "HOME_SERVICE"]),
  latitude: z.number().finite().min(-90).max(90).nullable().default(null),
  longitude: z.number().finite().min(-180).max(180).nullable().default(null),
});

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "no-store, max-age=0", Vary: "Cookie" },
});

async function limit(request: Request) {
  const decision = await consumeRateLimit("availability", trustedClientIdentifier(request.headers));
  if (decision.allowed) return null;
  const status = decision.unavailable ? 503 : 429;
  return NextResponse.json({ error: decision.unavailable ? "Availability is temporarily unavailable. Please try again shortly." : "Too many requests. Please wait a moment and try again." }, {
    status, headers: { "Cache-Control": "no-store, max-age=0", Vary: "Cookie", "Retry-After": String(decision.retryAfterSeconds) },
  });
}

async function publicAvailability(input: z.infer<typeof homeAvailabilityInput>) {
  if (input.fulfillment === "HOME_SERVICE" && (input.latitude === null || input.longitude === null)) {
    return json({ error: "Enter and confirm a service location before checking Home Service times." }, 400);
  }
  const userResult = await readVerifiedUser();
  if (input.fulfillment === "HOME_SERVICE" && !userResult.user) return json({ error: "Sign in to check Home Service times." }, 401);
  if (input.fulfillment === "HOME_SERVICE") {
    const access = await getAccess().catch(() => null);
    if (!await hasVerifiedCustomerAccount(access?.supabase, access?.principal)) return json({ error: "A customer account is required for Home Service." }, 403);
  }
  let client;
  try { client = createPrivilegedClient(); }
  catch { return json({ error: "Availability is temporarily unavailable. Please check the server configuration." }, 503); }
  const { data, error } = await client.rpc("server_public_branch_availability", {
    p_branch_slug: input.branch, p_service: input.service, p_date: input.date,
    p_staff: input.staff || null, p_auth_user: userResult.user?.id ?? null,
    p_fulfillment: input.fulfillment, p_latitude: input.latitude, p_longitude: input.longitude,
  });
  if (error || !data) return json({ error: "Availability could not be loaded." }, 503);
  return json(data);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fulfillment = url.searchParams.get("fulfillment") ?? "BUSINESS_LOCATION";
  if (fulfillment !== "BUSINESS_LOCATION" && fulfillment !== "HOME_SERVICE") return json({ error: "Provide a valid appointment location." }, 400);
  const input = availabilityInput.safeParse(Object.fromEntries(url.searchParams));
  if (!input.success) return json({ error: "Provide a valid service and business-local date." }, 400);
  const limited = await limit(request);
  if (limited) return limited;

  if (input.data.diagnostics) {
    let workspace;
    try { workspace = await resolveWorkspaceBranchContext("admin"); }
    catch { return json({ error: "Admin access with MFA is required for diagnostics." }, 403); }
    const branchId = workspace.branchContext.selectedBranchId;
    if (!branchId) return json({ error: "Select one branch before running availability diagnostics." }, 400);
    const { data, error } = await workspace.supabase.rpc("admin_availability_for_branch", {
      p_branch: branchId, p_service: input.data.service, p_date: input.data.date, p_staff: input.data.staff || null,
    });
    if (error || !data) return json({ error: "Availability could not be loaded." }, 503);
    return json(data);
  }

  if (fulfillment === "HOME_SERVICE") return json({ error: "Confirm the Home Service location before checking availability." }, 400);
  const parsed = homeAvailabilityInput.safeParse({
    branch: input.data.branch, service: input.data.service, date: input.data.date,
    staff: input.data.staff, fulfillment, latitude: null, longitude: null,
  });
  if (!parsed.success) return json({ error: "Choose a valid public branch." }, 400);
  return publicAvailability(parsed.data);
}

export async function POST(request: Request) {
  const limited = await limit(request);
  if (limited) return limited;
  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: "Provide a valid service location and booking date." }, 400); }
  const input = homeAvailabilityInput.safeParse(body);
  if (!input.success) return json({ error: "Provide a valid branch, service, date, and location." }, 400);
  return publicAvailability(input.data);
}
