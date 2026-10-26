import { sql } from "drizzle-orm";
import { db } from "@/db/client";

/**
 * Frees the still-held seats of a booking and marks a pending booking expired. Locks the booking
 * row first, then its seats in id order (the lock order confirmBooking and cleanup use).
 */
export async function releaseBooking(bookingId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`);
    await tx.execute(sql`
      SELECT id FROM seats WHERE booking_id = ${bookingId} AND status = 'held' ORDER BY id FOR UPDATE`);
    await tx.execute(sql`
      UPDATE seats
         SET status = 'available', booking_id = NULL, held_until = NULL
       WHERE booking_id = ${bookingId} AND status = 'held'`);
    await tx.execute(sql`UPDATE bookings SET status = 'expired' WHERE id = ${bookingId} AND status = 'pending'`);
  });
}
