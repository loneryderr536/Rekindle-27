import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { confirmBooking } from "@/server/payments/confirmBooking";
import type { PaymentGateway } from "@/server/payments/gateway";
import { processRefunds } from "@/server/payments/refunds";

const LOOKBACK_MS = 24 * 60 * 60 * 1000;

function reason(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Confirms bookings whose payment was captured but whose verify call and webhook never landed. */
async function confirmCaptured(gateway: PaymentGateway, now: Date): Promise<{ confirmed: number; checked: number }> {
  const since = new Date(now.getTime() - LOOKBACK_MS);
  const { rows } = await db.execute<{ id: string; order_id: string }>(sql`
    SELECT id, razorpay_order_id AS order_id FROM bookings
     WHERE status IN ('pending', 'expired') AND razorpay_order_id IS NOT NULL AND created_at >= ${since}
     ORDER BY created_at`);
  let confirmed = 0;
  for (const b of rows) {
    try {
      const captured = (await gateway.fetchOrderPayments(b.order_id)).find((p) => p.status === "captured");
      if (!captured) continue;
      const result = await confirmBooking({ orderId: b.order_id, paymentId: captured.id, amountPaise: captured.amount }, now);
      if (result === "confirmed") confirmed += 1;
    } catch (e) {
      console.error(`reconcilePending: booking ${b.id}: ${reason(e)}`);
    }
  }
  return { confirmed, checked: rows.length };
}

/** A refund_due booking whose payment Razorpay already shows as refunded was refunded but not recorded. */
async function recoverStuckRefunds(gateway: PaymentGateway): Promise<number> {
  const { rows } = await db.execute<{ id: string; order_id: string; payment_id: string }>(sql`
    SELECT id, razorpay_order_id AS order_id, razorpay_payment_id AS payment_id FROM bookings
     WHERE status = 'refund_due' AND razorpay_order_id IS NOT NULL AND razorpay_payment_id IS NOT NULL
     ORDER BY created_at`);
  let recovered = 0;
  for (const b of rows) {
    try {
      const payments = await gateway.fetchOrderPayments(b.order_id);
      if (!payments.some((p) => p.id === b.payment_id && p.status === "refunded")) continue;
      const done = await db.transaction(async (tx) => {
        const upd = await tx.execute(sql`
          UPDATE bookings SET status = 'refunded' WHERE id = ${b.id} AND status = 'refund_due'`);
        if (upd.rowCount !== 1) return false;
        await tx.execute(sql`
          INSERT INTO email_outbox (booking_id, kind, status) VALUES (${b.id}, 'refund_notice', 'pending')`);
        return true;
      });
      if (done) recovered += 1;
    } catch (e) {
      console.error(`reconcilePending: stuck refund ${b.id}: ${reason(e)}`);
    }
  }
  return recovered;
}

/** Safety net for lost webhooks: confirm captured payments, record refunds already made, then refund what is due. */
export async function reconcilePending(
  gateway: PaymentGateway,
  now: Date = new Date(),
): Promise<{ confirmed: number; checked: number; refunded: number }> {
  const { confirmed, checked } = await confirmCaptured(gateway, now);
  const recovered = await recoverStuckRefunds(gateway);
  const { refunded } = await processRefunds(gateway);
  return { confirmed, checked, refunded: refunded + recovered };
}
