import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { Booking } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { queueTicketsEmail } from "@/server/admin/bookings";

/**
 * Order: ownership (404) -> status (409) -> `beforeQueue` (the route's rate limit) -> queue.
 * Failed checks never reach `beforeQueue`, so they don't use up the owner's quota.
 */
export async function resendForGuest(
  bookingId: string,
  guestEmail: string,
  beforeQueue?: () => Promise<void>,
): Promise<void> {
  const { rows } = await db.execute<{ email: string; status: Booking["status"] }>(sql`
    SELECT email, status FROM bookings WHERE id = ${bookingId}`);
  const b = rows[0];
  if (!b || b.email.trim().toLowerCase() !== guestEmail.trim().toLowerCase()) {
    throw new AppError("NOT_FOUND", "Booking not found", 404);
  }
  if (b.status !== "paid" && b.status !== "comp") {
    throw new AppError("NOT_RESENDABLE", "Tickets can only be resent for confirmed bookings", 409);
  }
  await beforeQueue?.();
  // queueTicketsEmail re-checks the status under a FOR SHARE lock.
  await db.transaction((tx) => queueTicketsEmail(tx, bookingId));
}
