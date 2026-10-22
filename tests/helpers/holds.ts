import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { bookings, seats } from "@/db/schema";
import { randomToken } from "@/lib/random";
import { createHold } from "@/server/holds/createHold";

export const guest = { name: "Asha Rao", email: "asha@example.com", phone: "+919876543210" };

/** Distinct guest per index, so the one-active-hold rule does not interfere. */
export function guestN(i: number) {
  return {
    name: `Guest ${i}`,
    email: `guest${i}@example.com`,
    phone: `+9198${String(i).padStart(8, "0")}`,
  };
}

export async function statusOf(seatId: string): Promise<string> {
  const [row] = await db.select({ status: seats.status }).from(seats).where(eq(seats.id, seatId));
  return row.status;
}

/** createHold for `seatIds`, then attaches a unique Razorpay order ID (as the order-creation step would). */
export async function holdWithOrder(seatIds: string[], who: { name: string; email: string; phone: string } = guest, now?: Date) {
  const hold = await createHold({ seatIds, ...who }, now);
  const orderId = `order_test_${randomToken(9)}`;
  await db.update(bookings).set({ razorpayOrderId: orderId }).where(eq(bookings.id, hold.bookingId));
  return { ...hold, orderId };
}
