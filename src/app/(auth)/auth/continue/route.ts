import { NextRequest, NextResponse } from "next/server";
import { safeAppointmentDestination } from "@/lib/auth/access";
import { getAccess, redirectAfterLogin } from "@/lib/auth/access.server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const destination = safeAppointmentDestination(request.nextUrl.searchParams.get("next"));
  if (!destination) return NextResponse.redirect(new URL("/", request.url), { status: 303 });
  const { principal } = await getAccess();
  if (!principal) {
    const loginPath = destination.startsWith("/admin/") ? "/admin/login" : destination.startsWith("/staff/") ? "/staff/login" : "/login";
    const login = new URL(loginPath, request.url);
    login.searchParams.set("next", destination);
    return NextResponse.redirect(login, { status: 303, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  }
  return redirectAfterLogin(destination);
}
