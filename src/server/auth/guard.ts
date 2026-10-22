import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { getSession, readCookie, SESSION_COOKIE, type AdminRole, type SessionInfo } from "./session";

/** Rejects mutating requests whose Origin header is absent or not this app's origin. */
export function assertSameOrigin(req: Request): void {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(env.APP_URL).origin) {
    throw new AppError("BAD_ORIGIN", "Cross-origin request refused", 403);
  }
}

/** Guard for API routes. Throws AppError (401/403) for `jsonError` to render. */
export async function requireRole(req: Request, roles: AdminRole[]): Promise<SessionInfo> {
  assertSameOrigin(req);
  const session = await getSession(readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  if (!session) throw new AppError("UNAUTHORIZED", "Sign in required", 401);
  if (!roles.includes(session.role)) throw new AppError("FORBIDDEN", "Not allowed", 403);
  return session;
}

/** Guard for server components: redirects instead of throwing. */
export async function requireAdminPage(roles: AdminRole[]): Promise<SessionInfo> {
  const jar = await cookies();
  const session = await getSession(jar.get(SESSION_COOKIE)?.value ?? "");
  if (!session) redirect("/admin/login");
  if (!roles.includes(session.role)) redirect("/admin/login?denied=1");
  return session;
}
