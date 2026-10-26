import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { AppError } from "@/lib/errors";
import { logAudit } from "@/server/admin/audit";
import type { Tx } from "@/server/tickets/tokens";

/**
 * Takes a confirmed (paid or comp) booking's seats back on sale, deletes its tickets (so no QR code scans) and stops any
 * unsent tickets email. The caller must already hold the booking row lock; seats are then locked in
 * id order, the shared lock order.
 */
async function voidPaidBooking(tx: Tx, bookingId: string): Promise<void> {
  await tx.execute(sql`
    SELECT id FROM seats WHERE booking_id = ${bookingId} AND status = 'sold' ORDER BY id FOR UPDATE`);
  await tx.execute(sql`
    UPDATE seats SET status = 'available', booking_id = NULL, held_until = NULL
     WHERE booking_id = ${bookingId} AND status = 'sold'`);
  await tx.execute(sql`DELETE FROM tickets WHERE booking_id = ${bookingId}`);
  await tx.execute(sql`
    UPDATE email_outbox SET status = 'failed', last_error = 'Booking cancelled'
     WHERE booking_id = ${bookingId} AND kind = 'tickets' AND status = 'pending'`);
}

/**
 * Admin cancel of a confirmed booking: frees the seats and voids the tickets. A paid booking parks
 * its full amount as `refund_due` for refundBooking/processRefunds; a comp (nothing paid) becomes
 * `cancelled` and the guest is emailed. Refused once any of its tickets has been scanned.
 */
export async function cancelBooking(bookingId: string, adminUserId: string): Promise<"refund_due" | "cancelled"> {
  return db.transaction(async (tx) => {
    const { rows } = await tx.execute<{ public_code: string; status: string; amount_paise: number; payment_id: string | null }>(sql`
      SELECT public_code, status, amount_paise, razorpay_payment_id AS payment_id
        FROM bookings WHERE id = ${bookingId} FOR UPDATE`);
    const b = rows[0];
    if (!b) throw new AppError("NOT_FOUND", "Booking not found", 404);
    if (b.status !== "comp" && (b.status !== "paid" || !b.payment_id)) {
      throw new AppError("NOT_CANCELLABLE", "Only confirmed bookings can be cancelled", 409);
    }
    const { rows: scanned } = await tx.execute(sql`
      SELECT 1 FROM tickets WHERE booking_id = ${bookingId} AND checked_in_at IS NOT NULL LIMIT 1`);
    if (scanned.length > 0) {
      throw new AppError("ALREADY_CHECKED_IN", "A ticket of this booking has already been scanned at the gate", 409);
    }
    await voidPaidBooking(tx, bookingId);
    if (b.status === "comp") {
      await tx.execute(sql`UPDATE bookings SET status = 'cancelled' WHERE id = ${bookingId}`);
      await tx.execute(sql`
        INSERT INTO email_outbox (booking_id, kind, status) VALUES (${bookingId}, 'cancellation', 'pending')`);
      await logAudit(adminUserId, "cancel_comp", { bookingId, publicCode: b.public_code }, tx);
      return "cancelled";
    }
    await tx.execute(sql`
      UPDATE bookings SET status = 'refund_due', refund_amount_paise = amount_paise WHERE id = ${bookingId}`);
    await logAudit(adminUserId, "cancel_booking", {
      bookingId, publicCode: b.public_code, refundAmountPaise: b.amount_paise,
    }, tx);
    return "refund_due";
  });
}

export type GatewayRefundResult = "refunded" | "cancelled" | "partial" | "ignored";

/**
 * Records a refund Razorpay reports (webhook `refund.processed`), including one made by hand in the
 * Razorpay dashboard. A refund_due booking becomes refunded; a paid booking refunded in full is
 * cancelled (seats freed, tickets voided). Both get the refund email. A partial refund of a paid
 * booking leaves it paid.
 */
export async function applyGatewayRefund(p: { paymentId: string; refundedPaise: number }): Promise<GatewayRefundResult> {
  return db.transaction(async (tx) => {
    const { rows } = await tx.execute<{ id: string; status: string; amount_paise: number }>(sql`
      SELECT id, status, amount_paise FROM bookings WHERE razorpay_payment_id = ${p.paymentId} FOR UPDATE`);
    const b = rows[0];
    if (!b) return "ignored";
    if (b.status === "refund_due") {
      await tx.execute(sql`UPDATE bookings SET status = 'refunded' WHERE id = ${b.id}`);
    } else if (b.status === "paid") {
      if (p.refundedPaise < b.amount_paise) {
        console.warn(`applyGatewayRefund: partial refund of ${p.refundedPaise} paise on paid booking ${b.id}; left paid`);
        return "partial";
      }
      await voidPaidBooking(tx, b.id);
      await tx.execute(sql`
        UPDATE bookings SET status = 'refunded', refund_amount_paise = ${p.refundedPaise} WHERE id = ${b.id}`);
    } else {
      return "ignored";
    }
    await tx.execute(sql`
      INSERT INTO email_outbox (booking_id, kind, status) VALUES (${b.id}, 'refund_notice', 'pending')`);
    return b.status === "paid" ? "cancelled" : "refunded";
  });
}
