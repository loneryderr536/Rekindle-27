import { sql } from "drizzle-orm";
import { db } from "@/db/client";

export type CheckinTotals = { totalValid: number; checkedIn: number };
export type GateCount = { gate: string; count: number };
export type RecentCheckin = { ticketId: string; guestName: string; gate: string; checkedInAt: Date };

export type CheckinDashboard = {
  totals: CheckinTotals;
  byGate: GateCount[];
  recent: RecentCheckin[];
};

/** Live check-in progress across every gate, for the admin "day of" view. */
export async function getCheckinDashboard(): Promise<CheckinDashboard> {
  const [totals, byGate, recent] = await Promise.all([
    db.execute<{ total_valid: number; checked_in: number }>(sql`
      SELECT count(*) FILTER (WHERE b.status IN ('paid', 'comp'))::int AS total_valid,
             count(*) FILTER (WHERE b.status IN ('paid', 'comp') AND t.checked_in_at IS NOT NULL)::int AS checked_in
        FROM tickets t JOIN bookings b ON b.id = t.booking_id`),
    db.execute<{ gate: string | null; count: number }>(sql`
      SELECT t.gate, count(*)::int AS count
        FROM tickets t JOIN bookings b ON b.id = t.booking_id
       WHERE b.status IN ('paid', 'comp') AND t.checked_in_at IS NOT NULL
       GROUP BY t.gate
       ORDER BY count DESC, t.gate`),
    db.execute<{ id: string; name: string; gate: string | null; checked_in_at: Date }>(sql`
      SELECT t.id, b.name, t.gate, t.checked_in_at
        FROM tickets t
        JOIN bookings b ON b.id = t.booking_id
       WHERE t.checked_in_at IS NOT NULL
       ORDER BY t.checked_in_at DESC
       LIMIT 25`),
  ]);
  return {
    totals: { totalValid: totals.rows[0].total_valid, checkedIn: totals.rows[0].checked_in },
    byGate: byGate.rows.map((r) => ({ gate: r.gate ?? "Unknown gate", count: r.count })),
    recent: recent.rows.map((r) => ({
      ticketId: r.id, guestName: r.name, gate: r.gate ?? "Unknown gate", checkedInAt: new Date(r.checked_in_at),
    })),
  };
}
