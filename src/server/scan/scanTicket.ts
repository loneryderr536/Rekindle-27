import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";

export type ScanResult =
  | { result: "ok"; seatLabel: string; tierName: string; firstName: string }
  | { result: "already"; checkedInAt: Date; gate: string }
  | { result: "invalid" };

/**
 * One conditional UPDATE does the check-in: it only matches an un-scanned ticket whose booking is
 * paid or comp, so concurrent scans of one ticket produce exactly one row. The CTE then joins the
 * seat label, the tier name booked for that seat and the guest name for the green screen.
 */
async function checkIn(match: SQL, adminUserId: string, gate: string): Promise<ScanResult | null> {
  const { rows } = await db.execute<{ label: string; tier_name: string; name: string }>(sql`
    WITH u AS (
      UPDATE tickets t
         SET checked_in_at = now(), checked_in_by = ${adminUserId}, gate = ${gate}
        FROM bookings b
       WHERE ${match}
         AND t.checked_in_at IS NULL
         AND b.id = t.booking_id
         AND b.status IN ('paid', 'comp')
      RETURNING t.seat_id, t.booking_id
    )
    SELECT s.label, bi.tier_name, b.name
      FROM u
      JOIN seats s ON s.id = u.seat_id
      JOIN bookings b ON b.id = u.booking_id
      JOIN booking_items bi ON bi.booking_id = u.booking_id AND bi.seat_id = u.seat_id`);
  const row = rows[0];
  if (!row) return null;
  return {
    result: "ok",
    seatLabel: row.label,
    tierName: row.tier_name,
    firstName: row.name.trim().split(/\s+/)[0] ?? "",
  };
}

/** Why a check-in matched nothing: scanned earlier (only for a still-valid booking) or invalid. */
async function explainMiss(match: SQL): Promise<ScanResult> {
  const { rows } = await db.execute<{ checked_in_at: Date | null; gate: string | null }>(sql`
    SELECT t.checked_in_at, t.gate
      FROM tickets t JOIN bookings b ON b.id = t.booking_id
     WHERE ${match} AND b.status IN ('paid', 'comp')`);
  const row = rows[0];
  if (row?.checked_in_at) return { result: "already", checkedInAt: new Date(row.checked_in_at), gate: row.gate ?? "" };
  return { result: "invalid" };
}

export async function scanTicket(p: { token: string; adminUserId: string; gate: string }): Promise<ScanResult> {
  const match = sql`t.token = ${p.token}`;
  return (await checkIn(match, p.adminUserId, p.gate)) ?? (await explainMiss(match));
}

/** Manual check-in of one ticket from the search panel; same rules and result as a scan. */
export async function checkInTicketById(ticketId: string, adminUserId: string, gate: string): Promise<ScanResult> {
  const match = sql`t.id = ${ticketId}`;
  return (await checkIn(match, adminUserId, gate)) ?? (await explainMiss(match));
}
