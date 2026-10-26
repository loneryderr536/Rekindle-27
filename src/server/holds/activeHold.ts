import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { releaseBooking } from "@/server/holds/releaseBooking";

export type ActiveHold = {
  bookingId: string;
  publicCode: string;
  accessToken: string;
  amountPaise: number;
  holdExpiresAt: Date;
  razorpayOrderId: string;
  name: string;
  email: string;
  phone: string;
  seatIds: string[];
};

type Row = {
  id: string; public_code: string; access_token: string; amount_paise: number; hold_expires_at: Date;
  razorpay_order_id: string; name: string; email: string; phone: string;
};

/** The guest's hold, if it is still pending, unexpired by `now` and has its Razorpay order (so it can be paid). */
export async function getActiveHold(accessToken: string, now: Date = new Date()): Promise<ActiveHold | null> {
  const { rows } = await db.execute<Row>(sql`
    SELECT id, public_code, access_token, amount_paise, hold_expires_at, razorpay_order_id, name, email, phone
      FROM bookings
     WHERE access_token = ${accessToken} AND status = 'pending'
       AND hold_expires_at > ${now} AND razorpay_order_id IS NOT NULL`);
  const b = rows[0];
  if (!b) return null;
  const seats = await db.execute<{ id: string }>(sql`
    SELECT id FROM seats WHERE booking_id = ${b.id} AND status = 'held' ORDER BY id`);
  return {
    bookingId: b.id,
    publicCode: b.public_code,
    accessToken: b.access_token,
    amountPaise: b.amount_paise,
    holdExpiresAt: new Date(b.hold_expires_at),
    razorpayOrderId: b.razorpay_order_id,
    name: b.name,
    email: b.email,
    phone: b.phone,
    seatIds: seats.rows.map((s) => s.id),
  };
}

/** Lets the guest give their held seats back. Returns false when there is no pending hold for the token. */
export async function cancelHold(accessToken: string): Promise<boolean> {
  const { rows } = await db.execute<{ id: string }>(sql`
    SELECT id FROM bookings WHERE access_token = ${accessToken} AND status = 'pending'`);
  if (!rows[0]) return false;
  await releaseBooking(rows[0].id);
  return true;
}
