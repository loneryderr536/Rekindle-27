import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { env } from "@/lib/env";
import { AppError, jsonError } from "@/lib/errors";
import { kickOutbox } from "@/server/email/kickOutbox";
import { applyGatewayRefund } from "@/server/payments/cancelBooking";
import { confirmBooking } from "@/server/payments/confirmBooking";
import { verifyWebhookSignature } from "@/server/payments/signatures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Event = z.object({ event: z.string().min(1) }).passthrough();
const PaymentEntity = z.object({
  id: z.string().min(1),
  order_id: z.string().min(1),
  amount: z.number().int().nonnegative(),
});
const PaymentPayload = z.object({ payload: z.object({ payment: z.object({ entity: PaymentEntity }) }) });
const RefundPayload = z.object({
  payload: z.object({
    refund: z.object({ entity: z.object({ payment_id: z.string().min(1), amount: z.number().int().nonnegative() }) }),
    // Razorpay includes the payment too; amount_refunded is its running total across partial refunds.
    payment: z.object({ entity: z.object({ amount_refunded: z.number().int().nonnegative().optional() }) }).optional(),
  }),
});

/** Runs the handler for one event and returns the JSON body to send back (always a 200 on success). */
async function handle(eventType: string, body: unknown): Promise<Record<string, unknown>> {
  switch (eventType) {
    case "order.paid":
    case "payment.captured": {
      const p = PaymentPayload.parse(body).payload.payment.entity;
      const result = await confirmBooking({ orderId: p.order_id, paymentId: p.id, amountPaise: p.amount });
      if (result === "confirmed" || result === "refund_due") kickOutbox();
      return { ok: true, result };
    }
    case "payment.failed": {
      const p = PaymentPayload.safeParse(body);
      console.warn("razorpay payment.failed", p.success ? { orderId: p.data.payload.payment.entity.order_id } : {});
      return { ok: true };
    }
    case "refund.processed": {
      const { refund, payment } = RefundPayload.parse(body).payload;
      const refundedPaise = payment?.entity.amount_refunded ?? refund.entity.amount;
      const result = await applyGatewayRefund({ paymentId: refund.entity.payment_id, refundedPaise });
      if (result === "refunded" || result === "cancelled") kickOutbox();
      return { ok: true, result };
    }
    default:
      return { ok: true, ignored: true };
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    // The signature covers the exact bytes Razorpay sent, so read the raw text before parsing.
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature");
    if (!signature || !verifyWebhookSignature(rawBody, signature, env.RAZORPAY_WEBHOOK_SECRET)) {
      throw new AppError("BAD_SIGNATURE", "Webhook signature is invalid", 400);
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new AppError("VALIDATION", "Request body must be valid JSON", 400);
    }
    const { event: eventType } = Event.parse(body);

    const eventId = req.headers.get("x-razorpay-event-id");
    if (eventId) {
      const seen = await db.execute(sql`SELECT 1 FROM webhook_events WHERE razorpay_event_id = ${eventId}`);
      if (seen.rows.length > 0) return Response.json({ duplicate: true });
    }

    const result = await handle(eventType, body);

    // Recorded only after processing succeeds, so a failure is retried by Razorpay (handlers are idempotent).
    if (eventId) {
      await db.execute(sql`
        INSERT INTO webhook_events (razorpay_event_id, event_type, payload)
        VALUES (${eventId}, ${eventType}, ${JSON.stringify(body)}::jsonb)
        ON CONFLICT (razorpay_event_id) DO NOTHING`);
    }
    return Response.json(result);
  } catch (e) {
    return jsonError(e);
  }
}
