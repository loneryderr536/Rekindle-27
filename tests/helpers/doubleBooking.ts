import { sql } from "drizzle-orm";
import { db } from "@/db/client";

/** The launch-readiness invariant: no seat is in more than one paid/comp booking. Same SQL as tests/load/check-double-booking.sql. */
export async function assertNoDoubleBooking(): Promise<void> {
  const { rows } = await db.execute<{ seat_id: string }>(sql`
    SELECT seat_id
      FROM booking_items bi
      JOIN bookings b ON b.id = bi.booking_id
     WHERE b.status IN ('paid','comp','pending')
     GROUP BY seat_id
    HAVING count(*) FILTER (WHERE b.status IN ('paid','comp')) > 1`);
  if (rows.length > 0) {
    throw new Error(`Double-booked seats: ${rows.map((r) => r.seat_id).join(", ")}`);
  }
}
