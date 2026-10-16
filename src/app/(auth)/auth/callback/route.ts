import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeAuthDestination, safeAppointmentDestination } from "@/lib/auth/access";
import { siteUrl } from "@/lib/auth/site-url.server";
import { provisionVerifiedCustomer } from "@/features/auth/provision-customer.server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const requested = request.nextUrl.searchParams.get("next");
  const destination = safeAppointmentDestination(requested) ?? safeAuthDestination(requested);
  const supabase = await createClient();
  const { error } = code ? await supabase.auth.exchangeCodeForSession(code) : { error: true };
  if (!error && destination.startsWith("/account")) await provisionVerifiedCustomer(supabase);
  const response = NextResponse.redirect(new URL(error ? "/auth/error" : destination, siteUrl()));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
