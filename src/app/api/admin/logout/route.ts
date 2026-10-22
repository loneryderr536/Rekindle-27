import { jsonError } from "@/lib/errors";
import { assertSameOrigin } from "@/server/auth/guard";
import { clearedSessionCookie, destroySession, readCookie, SESSION_COOKIE } from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
    await destroySession(readCookie(req.headers.get("cookie"), SESSION_COOKIE));
    const res = Response.json({ ok: true });
    res.headers.set("Set-Cookie", clearedSessionCookie());
    return res;
  } catch (e) {
    return jsonError(e);
  }
}
