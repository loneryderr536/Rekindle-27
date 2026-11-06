import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { jsonError } from "@/lib/errors";
import { normalizeIndianPhone } from "@/lib/phone";
import { requireRole } from "@/server/auth/guard";
import { SearchQuery } from "@/server/scan/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  id: string; booking_id: string; ticket_index: number; ticket_count: number; public_code: string;
  name: string; status: string; checked_in_at: Date | null; gate: string | null;
};

export async function GET(req: Request): Promise<Response> {
  try {
    await requireRole(req, ["admin", "scanner"]);
    const q = SearchQuery.parse(new URL(req.url).searchParams.get("q") ?? "");
    const phone = normalizeIndianPhone(q);
    // General admission: no seat/tier, just this ticket's position within its own booking (1 of 2, etc).
    const { rows } = await db.execute<Row>(sql`
      SELECT t.id, t.booking_id, b.public_code, b.name, b.status, t.checked_in_at, t.gate,
             row_number() OVER (PARTITION BY t.booking_id ORDER BY s.label) AS ticket_index,
             count(*) OVER (PARTITION BY t.booking_id) AS ticket_count
        FROM tickets t
        JOIN bookings b ON b.id = t.booking_id
        JOIN seats s ON s.id = t.seat_id
       WHERE upper(b.public_code) = upper(${q}) OR b.phone = ${phone}
       ORDER BY b.created_at, s.label
       LIMIT 20`);
    return Response.json({
      tickets: rows.map((r) => ({
        ticketId: r.id,
        ticketIndex: Number(r.ticket_index),
        ticketCount: Number(r.ticket_count),
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
