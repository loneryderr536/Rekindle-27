import { NextResponse, type NextRequest } from "next/server";

// Next 16 renamed `middleware` to `proxy`. This is only a cheap redirect for people who are
// obviously signed out; the real session and role check happens in requireRole/requireAdminPage.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();
  if (!request.cookies.has("admin_session")) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/scan"],
};
