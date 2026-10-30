import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { FAKE_GUEST_COOKIE, readFakeGuest } from "@/server/guestAuth/fakeGuest";
import { guestGate } from "@/server/guestAuth/guestGate";

// Next 16 renamed `middleware` to `proxy`. Admin/scanner: only a cheap redirect for people who are
// obviously signed out; the real session and role check happens in requireRole/requireAdminPage.
// Guest routes: refresh the Supabase session cookies and redirect signed-out guests.
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/admin") || pathname === "/scan") {
    if (pathname === "/admin/login") return NextResponse.next();
    if (!request.cookies.has("admin_session")) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  // Cache headers from @supabase/ssr arrive only with the first cookie write; keep them for every response we build.
  const cacheHeaders: Record<string, string> = {};
  let signedIn = false;

  if (env.GUEST_AUTH === "fake") {
    signedIn = readFakeGuest(request.cookies.get(FAKE_GUEST_COOKIE)?.value) !== null;
  } else {
    try {
      const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (list, headers) => {
            Object.assign(cacheHeaders, headers);
            for (const { name, value } of list) request.cookies.set(name, value);
            response = NextResponse.next({ request });
            for (const { name, value, options } of list) response.cookies.set(name, value, options);
            for (const [k, v] of Object.entries(cacheHeaders)) response.headers.set(k, v);
          },
        },
      });
      const user = (await supabase.auth.getUser()).data.user;
      signedIn = !!user && !!user.email && !!user.email_confirmed_at;
    } catch (e) {
      // Supabase unreachable: treat as signed out for the redirect; pages show their own messages.
      console.error("proxy getUser failed", e);
    }
  }

  const to = guestGate(pathname, search, signedIn);
  if (to) {
    const redirect = NextResponse.redirect(new URL(to, request.url));
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    for (const [k, v] of Object.entries(cacheHeaders)) redirect.headers.set(k, v);
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/scan", "/register/:path*", "/my-bookings", "/sign-in", "/auth/:path*"],
};
