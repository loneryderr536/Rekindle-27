import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { createTicketsForBooking, type Tx } from "@/server/tickets/tokens";

export type ConfirmResult = "confirmed" | "already_paid" | "refund_due" | "unknown_order";

type LockedBooking = { id: string; status: string; amount_paise: number; seat_count: number };

/** Frees this booking's still-attached held seats and parks the payment (the amount actually paid) for a full refund. */
async function markRefundDue(
  tx: Tx, bookingId: string, p: { paymentId: string; amountPaise: number },
): Promise<"refund_due"> {
  await tx.execute(sql`
    UPDATE seats
       SET status = 'available', booking_id = NULL, held_until = NULL
     WHERE booking_id = ${bookingId} AND status = 'held'`);
  await tx.execute(sql`
    UPDATE bookings
       SET status = 'refund_due', razorpay_payment_id = ${p.paymentId}, refund_amount_paise = ${p.amountPaise}
     WHERE id = ${bookingId}`);
  return "refund_due";
}

/**
 * Applies a successful Razorpay payment to its booking, idempotently. Safe to call any number of
 * times, concurrently, from both the verify endpoint and the webhook: the booking row lock plus the
 * status check make every call after the first a no-op. A payment for a booking whose seats are no
 * longer all attached (or whose amount does not match) becomes `refund_due` instead of tickets.
 */
export async function confirmBooking(
  p: { orderId: string; paymentId: string; amountPaise: number },
  now: Date = new Date(),
): Promise<ConfirmResult> {
  return db.transaction(async (tx) => {
    const { rows } = await tx.execute<LockedBooking>(sql`
      SELECT id, status, amount_paise, seat_count
        FROM bookings WHERE razorpay_order_id = ${p.orderId} FOR UPDATE`);
    const booking = rows[0];
    if (!booking) return "unknown_order";

    switch (booking.status) {
      case "paid":
      case "comp":
        return "already_paid";
      case "refund_due":
      case "refunded":
        return "refund_due";
      case "pending":
      case "expired":
        break;
      default:
        throw new Error(`confirmBooking: unexpected booking status "${booking.status}"`);
    }

    if (p.amountPaise !== booking.amount_paise) return markRefundDue(tx, booking.id, p);

    // Lock the seats still attached to this booking (whether or not held_until has passed) so a
    // concurrent createHold cannot re-take an expired one between this check and the sale below.
    const { rows: attached } = await tx.execute<{ id: string }>(sql`
      SELECT id FROM seats WHERE booking_id = ${booking.id} AND status = 'held'
       ORDER BY id FOR UPDATE`);
    if (attached.length !== booking.seat_count) return markRefundDue(tx, booking.id, p);

    const sold = await tx.execute(sql`
      UPDATE seats SET status = 'sold', held_until = NULL
       WHERE booking_id = ${booking.id} AND status = 'held'`);
    if (sold.rowCount !== booking.seat_count) {
      throw new Error(`confirmBooking: sold ${sold.rowCount} of ${booking.seat_count} seats`);
    }
    await tx.execute(sql`
      UPDATE bookings
         SET status = 'paid', razorpay_payment_id = ${p.paymentId}, paid_at = ${now}
       WHERE id = ${booking.id}`);
    await createTicketsForBooking(tx, booking.id);
    await tx.execute(sql`
      INSERT INTO email_outbox (booking_id, kind, status) VALUES (${booking.id}, 'tickets', 'pending')`);
    return "confirmed";
  });
}
