import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { Booking } from "@/db/schema";
import { qrPngStyled } from "@/server/tickets/qr";
import { qrPayload } from "@/server/tickets/tokens";
import { ticketsVisible } from "@/server/tickets/visibility";

export const runtime = "nodejs";

/**
 * The QR image for one ticket, as its own cacheable endpoint instead of a base64 PNG inlined into the
 * booking page's HTML on every render. The ticket token is already an unguessable 32-byte secret and
 * the URL is keyed by it, so the image never changes for a given URL — safe to cache hard, in the
 * browser and on a CDN, instead of the server re-rendering a 640px PNG on every page view.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  const { rows } = await db.execute<{ status: Booking["status"] }>(sql`
    SELECT b.status FROM tickets t JOIN bookings b ON b.id = t.booking_id WHERE t.token = ${token}`);
  const status = rows[0]?.status;
  if (!status || !ticketsVisible(status)) return new Response("Not found", { status: 404 });

  const png = await qrPngStyled(qrPayload(token));
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
