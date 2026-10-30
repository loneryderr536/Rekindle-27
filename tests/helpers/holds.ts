import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { bookings, seats } from "@/db/schema";
import { randomToken } from "@/lib/random";
import { createHold } from "@/server/holds/createHold";
import { setGuestForTests } from "@/server/guestAuth/getGuest";

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

/** Stable uuid per email, so the same guest keeps one identity across requests. */
export function guestIdFor(email: string): string {
  const h = createHash("md5").update(email.trim().toLowerCase()).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Signs in (test override) as the guest named in a request body, or as nobody when the body has no email. */
export function signInFromBody(body: unknown): void {
  const b = body as { email?: unknown; name?: unknown } | null;
  if (b && typeof b.email === "string") {
    setGuestForTests({
      guest: { userId: guestIdFor(b.email), email: b.email, name: typeof b.name === "string" ? b.name : null },
    });
  }
}
