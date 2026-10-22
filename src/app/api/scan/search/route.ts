import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { jsonError } from "@/lib/errors";
import { normalizeIndianPhone } from "@/lib/phone";
import { requireRole } from "@/server/auth/guard";
import { SearchQuery } from "@/server/scan/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  id: string; label: string; tier_name: string; public_code: string; name: string;
  status: string; checked_in_at: Date | null; gate: string | null;
};

export async function GET(req: Request): Promise<Response> {
  try {
    await requireRole(req, ["admin", "scanner"]);
    const q = SearchQuery.parse(new URL(req.url).searchParams.get("q") ?? "");
    const phone = normalizeIndianPhone(q);
    const { rows } = await db.execute<Row>(sql`
      SELECT t.id, s.label, bi.tier_name, b.public_code, b.name, b.status, t.checked_in_at, t.gate
        FROM tickets t
        JOIN bookings b ON b.id = t.booking_id
        JOIN seats s ON s.id = t.seat_id
        JOIN booking_items bi ON bi.booking_id = t.booking_id AND bi.seat_id = t.seat_id
       WHERE upper(b.public_code) = upper(${q}) OR b.phone = ${phone}
       ORDER BY b.created_at, s.label
       LIMIT 20`);
    return Response.json({
      tickets: rows.map((r) => ({
        ticketId: r.id,
        seatLabel: r.label,
        tierName: r.tier_name,
        bookingCode: r.public_code,
        guestName: r.name,
        bookingStatus: r.status,
        checkedInAt: r.checked_in_at ? new Date(r.checked_in_at).toISOString() : null,
        gate: r.gate,
      })),
    });
  } catch (e) {
    return jsonError(e);
  }
}
