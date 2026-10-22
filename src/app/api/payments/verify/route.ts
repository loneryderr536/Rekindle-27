import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { bookings } from "@/db/schema";
import { env } from "@/lib/env";
import { AppError, jsonError } from "@/lib/errors";
import { kickOutbox } from "@/server/email/kickOutbox";
import { confirmBooking } from "@/server/payments/confirmBooking";
import { getGateway } from "@/server/payments/gateway";
import { verifyPaymentSignature } from "@/server/payments/signatures";
import { clientIp } from "@/server/security/clientIp";
import { rateLimit } from "@/server/security/rateLimit";

const LIMIT = 30;
const WINDOW_SECONDS = 600;

const VerifyInput = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function accessTokenFor(orderId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ accessToken: bookings.accessToken })
    .from(bookings)
    .where(eq(bookings.razorpayOrderId, orderId));
  return row?.accessToken;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const rl = await rateLimit(`verify:ip:${clientIp(req)}`, LIMIT, WINDOW_SECONDS);
    if (!rl.ok) {
      const res = jsonError(new AppError("RATE_LIMITED", "Too many requests, please try again later", 429));
      res.headers.set("Retry-After", String(rl.retryAfter));
      return res;
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      throw new AppError("VALIDATION", "Request body must be valid JSON", 400);
    }
    const input = VerifyInput.parse(raw);
    const orderId = input.razorpay_order_id;
    const paymentId = input.razorpay_payment_id;

    const valid = verifyPaymentSignature(
      { orderId, paymentId, signature: input.razorpay_signature },
      env.RAZORPAY_KEY_SECRET,
    );
    if (!valid) throw new AppError("BAD_SIGNATURE", "Payment signature is invalid", 400);

    // The amount is never taken from the browser: it comes from Razorpay's record of the payment.
    const payments = await getGateway().fetchOrderPayments(orderId);
    const payment = payments.find((p) => p.id === paymentId);

    if (!payment || payment.status !== "captured") {
      const accessToken = await accessTokenFor(orderId);
      if (!accessToken) throw new AppError("UNKNOWN_ORDER", "Unknown order", 404);
      return Response.json({ status: "pending", accessToken }, { status: 202 });
    }

    const status = await confirmBooking({ orderId, paymentId, amountPaise: payment.amount });
    if (status === "unknown_order") throw new AppError("UNKNOWN_ORDER", "Unknown order", 404);
    if (status === "confirmed" || status === "refund_due") kickOutbox();

    const accessToken = await accessTokenFor(orderId);
    if (!accessToken) throw new AppError("UNKNOWN_ORDER", "Unknown order", 404);
    return Response.json({ status, accessToken });
  } catch (e) {
    return jsonError(e);
  }
}
