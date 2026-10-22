import { sql } from "drizzle-orm";
import { db } from "@/db/client";

const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * Releases the seats of every pending booking whose hold has expired and marks it `expired`, and
 * purges rate-limit windows older than 24 h.
 * Lock order matches confirmBooking (booking rows first, then seats in id order, as createHold also
 * locks them), so none of the three can deadlock; SKIP LOCKED leaves a booking that is being
 * confirmed right now alone. The release UPDATE filters on booking_id, so a seat that createHold
 * re-took for a new booking while we waited for its lock is left alone.
 */
export async function releaseExpiredHolds(
  now: Date = new Date(),
): Promise<{ released: number; purgedRateLimits: number }> {
  const released = await db.transaction(async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(sql`
      SELECT id FROM bookings
       WHERE status = 'pending' AND hold_expires_at <= ${now}
       ORDER BY id FOR UPDATE SKIP LOCKED`);
    if (rows.length === 0) return 0;
    const ids = sql.param(rows.map((r) => r.id));
    await tx.execute(sql`
      SELECT id FROM seats
       WHERE status = 'held' AND booking_id = ANY(${ids}::uuid[])
       ORDER BY id FOR UPDATE`);
    await tx.execute(sql`
      UPDATE seats
         SET status = 'available', booking_id = NULL, held_until = NULL
       WHERE status = 'held' AND booking_id = ANY(${ids}::uuid[])`);
    await tx.execute(sql`UPDATE bookings SET status = 'expired' WHERE id = ANY(${ids}::uuid[])`);
    return rows.length;
  });

  const cutoff = new Date(now.getTime() - RATE_LIMIT_RETENTION_MS);
  const purged = await db.execute(sql`DELETE FROM rate_limits WHERE window_start < ${cutoff}`);
  return { released, purgedRateLimits: purged.rowCount ?? 0 };
}
