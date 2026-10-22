import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { PaymentGateway } from "@/server/payments/gateway";

class RefundFailed extends Error {}

/**
 * Fully refunds every `refund_due` booking that has a payment ID and recorded paid amount
 * (`refund_amount_paise`, set by confirmBooking), one transaction per booking.
 * The row stays locked across the gateway call, so concurrent runs never refund twice; a gateway
 * error rolls that booking back to `refund_due` for the next run.
 */
export async function processRefunds(gateway: PaymentGateway): Promise<{ refunded: number; failed: number }> {
  const { rows: due } = await db.execute<{ id: string }>(sql`
    SELECT id FROM bookings
     WHERE status = 'refund_due' AND razorpay_payment_id IS NOT NULL AND refund_amount_paise IS NOT NULL
     ORDER BY created_at`);

  let refunded = 0;
  let failed = 0;
  for (const { id } of due) {
    try {
      const done = await db.transaction(async (tx) => {
        const { rows } = await tx.execute<{ payment_id: string; refund_amount_paise: number }>(sql`
          SELECT razorpay_payment_id AS payment_id, refund_amount_paise
            FROM bookings
           WHERE id = ${id} AND status = 'refund_due'
             AND razorpay_payment_id IS NOT NULL AND refund_amount_paise IS NOT NULL
             FOR UPDATE SKIP LOCKED`);
        const b = rows[0];
        if (!b) return false; // refunded meanwhile, or another worker holds it
        try {
          await gateway.refund(b.payment_id, b.refund_amount_paise);
        } catch (e) {
          throw new RefundFailed(e instanceof Error ? e.message : String(e));
        }
        await tx.execute(sql`UPDATE bookings SET status = 'refunded' WHERE id = ${id}`);
        await tx.execute(sql`
          INSERT INTO email_outbox (booking_id, kind, status) VALUES (${id}, 'refund_notice', 'pending')`);
        return true;
      });
      if (done) refunded += 1;
    } catch (e) {
      failed += 1;
      const reason = e instanceof RefundFailed ? "gateway refund failed" : "refund bookkeeping failed";
      console.error(`processRefunds: booking ${id}: ${reason}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { refunded, failed };
}
