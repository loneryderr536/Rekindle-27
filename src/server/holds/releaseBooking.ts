import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { bookings } from "@/db/schema";

/** Frees the still-held seats of a booking and marks a pending booking expired. */
export async function releaseBooking(bookingId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      UPDATE seats
         SET status = 'available', booking_id = NULL, held_until = NULL
       WHERE booking_id = ${bookingId} AND status = 'held'`);
    await tx
      .update(bookings)
      .set({ status: "expired" })
      .where(and(eq(bookings.id, bookingId), eq(bookings.status, "pending")));
  });
}
