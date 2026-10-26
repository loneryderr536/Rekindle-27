import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { applyGatewayRefund } from "@/server/payments/cancelBooking";
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

/**
 * A paid booking refunded in the Razorpay dashboard whose `refund.processed` webhook never arrived:
 * one refund listing per run (not one call per booking), then the same rules as the webhook.
 */
async function recoverDashboardRefunds(gateway: PaymentGateway, now: Date): Promise<number> {
  const since = Math.floor((now.getTime() - LOOKBACK_MS) / 1000);
  const refundedByPayment = new Map<string, number>();
  for (const r of await gateway.listRefunds(since)) {
    if (r.status === "processed") refundedByPayment.set(r.paymentId, (refundedByPayment.get(r.paymentId) ?? 0) + r.amount);
  }
  if (refundedByPayment.size === 0) return 0;
  const { rows } = await db.execute<{ id: string; payment_id: string }>(sql`
    SELECT id, razorpay_payment_id AS payment_id FROM bookings
     WHERE status = 'paid' AND razorpay_payment_id = ANY(${sql.param([...refundedByPayment.keys()])}::text[])`);
  let cancelled = 0;
  for (const b of rows) {
    try {
      const result = await applyGatewayRefund({ paymentId: b.payment_id, refundedPaise: refundedByPayment.get(b.payment_id)! });
      if (result === "cancelled") cancelled += 1;
    } catch (e) {
      console.error(`reconcilePending: dashboard refund ${b.id}: ${reason(e)}`);
    }
  }
  return cancelled;
}

/**
 * Safety net for lost webhooks: confirm captured payments, record refunds already made (by this app
 * or by hand in the dashboard), then refund what is due. `refunded` counts all refunds recorded.
 */
export async function reconcilePending(
  gateway: PaymentGateway,
  now: Date = new Date(),
): Promise<{ confirmed: number; checked: number; refunded: number }> {
  const { confirmed, checked } = await confirmCaptured(gateway, now);
  const recovered = await recoverStuckRefunds(gateway);
  let dashboard = 0;
  try {
    dashboard = await recoverDashboardRefunds(gateway, now);
  } catch (e) {
    console.error(`reconcilePending: refund listing failed: ${reason(e)}`);
  }
  const { refunded } = await processRefunds(gateway);
  return { confirmed, checked, refunded: refunded + recovered + dashboard };
}
