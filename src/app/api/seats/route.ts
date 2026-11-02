import { createHash } from "node:crypto";
import { jsonError } from "@/lib/errors";
import { listSeats } from "@/server/seats/listSeats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Seat-map clients poll this every 5s; most polls see no change, so an ETag lets the browser get a
 * cheap 304 instead of re-transferring and re-rendering all 1,000+ seat records every time.
 */
export async function GET(request?: Request): Promise<Response> {
  try {
    const data = await listSeats();
    const body = JSON.stringify(data);
    const etag = `"${createHash("sha1").update(body).digest("hex")}"`;
    const headers = { "Cache-Control": "no-store", ETag: etag };
    if (request?.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(body, { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
  } catch (e) {
    return jsonError(e);
  }
}
