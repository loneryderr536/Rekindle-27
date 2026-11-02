import { createHash } from "node:crypto";
import { jsonError } from "@/lib/errors";
import { getCheckinDashboard } from "@/server/admin/checkins";
import { requireRole } from "@/server/auth/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Polled by the admin check-in dashboard; ETag'd like /api/seats since most polls see no change. */
export async function GET(req: Request): Promise<Response> {
  try {
    await requireRole(req, ["admin"]);
    const data = await getCheckinDashboard();
    const body = JSON.stringify(data);
    const etag = `"${createHash("sha1").update(body).digest("hex")}"`;
    const headers = { "Cache-Control": "no-store", ETag: etag };
    if (req.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(body, { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
  } catch (e) {
    return jsonError(e);
  }
}
