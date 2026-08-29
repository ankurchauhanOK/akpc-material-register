import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Next.js 16 runs this file (the renamed middleware) on the Node.js
// runtime. It is a ROUTING/refresh convenience layer ONLY — the real
// auth boundary lives in the protected (app) layout and, ultimately,
// in Postgres RLS. Do not treat this proxy as a hard security gate.

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refreshes the session if expired (important for long-lived sessions).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const url = request.nextUrl;
  const isLoginPage = url.pathname === "/login";

  // Authenticated users visiting /login -> go to dashboard.
  if (user && isLoginPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Unauthenticated users hitting any other route -> login.
  if (!user && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Run on all routes except static assets, images, favicon and the
     * API/callback paths that do not need a session.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
