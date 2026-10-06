import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv } from "@/config/env";

export async function proxy(request: NextRequest) {
  // Permit setup/error pages to render before local credentials are supplied.
  // Protected pages/actions still fail closed when their client is requested.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    const response = NextResponse.next({ request });
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
  const env = getSupabasePublicEnv();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.publishableKey, {
    cookieOptions: { secure: process.env.NODE_ENV === "production" },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getClaims();
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

// Proxy refreshes sessions; it is not the authorization boundary.
export const config = { matcher: ["/account/:path*", "/staff/:path*", "/admin/:path*", "/owner/login", "/auth/:path*", "/login", "/register", "/forgot-password", "/reset-password"] };
