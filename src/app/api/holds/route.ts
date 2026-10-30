import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { bookings } from "@/db/schema";
import { env, loadTestLimitsDisabled } from "@/lib/env";
import { AppError, jsonError } from "@/lib/errors";
import { getGuest } from "@/server/guestAuth/getGuest";
import { createHold } from "@/server/holds/createHold";
import { releaseBooking } from "@/server/holds/releaseBooking";
import { HoldInput } from "@/server/holds/schemas";
import { getGateway } from "@/server/payments/gateway";
import { clientIp } from "@/server/security/clientIp";
import { rateLimit } from "@/server/security/rateLimit";
import { verifyTurnstile } from "@/server/security/turnstile";

// Generous: Turnstile stops bots, and many guests can share one IP (offices, colleges, mobile carriers).
const LIMIT = 60;
const WINDOW_SECONDS = 600;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const ip = clientIp(req);
    // Staging load runs only (needs ALLOW_TEST_MODES=1, refused in production): no per-IP limit.
    const limitsOff = loadTestLimitsDisabled(env);
    const rl = limitsOff ? { ok: true as const } : await rateLimit(`holds:ip:${ip}`, LIMIT, WINDOW_SECONDS);
    if (!rl.ok) {
      const res = jsonError(new AppError("RATE_LIMITED", "Too many requests, please try again later", 429));
      res.headers.set("Retry-After", String(rl.retryAfter));
      return res;
    }

    // Identity comes from the verified session, never from the request body.
    const guest = await getGuest();
    if (!guest) throw new AppError("SIGN_IN_REQUIRED", "Sign in to book", 401);

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      throw new AppError("VALIDATION", "Request body must be valid JSON", 400);
    }
    const { turnstileToken, ...input } = HoldInput.parse(raw);

    if (!(await verifyTurnstile(turnstileToken, ip))) {
      throw new AppError("TURNSTILE_FAILED", "Bot check failed, please retry", 403);
    }

    const hold = await createHold({ ...input, email: guest.email, guestUserId: guest.userId, clientIp: ip });

    let orderId: string;
    try {
      const order = await getGateway().createOrder({
        amountPaise: hold.amountPaise,
        receipt: hold.bookingId,
        notes: { booking_id: hold.bookingId },
      });
      orderId = order.id;
      await db.update(bookings).set({ razorpayOrderId: orderId }).where(eq(bookings.id, hold.bookingId));
    } catch (e) {
      await releaseBooking(hold.bookingId);
      console.error(e);
      throw new AppError("PAYMENT_UNAVAILABLE", "Payment service is unavailable, please try again", 502);
    }

    return Response.json(
      {
        bookingId: hold.bookingId,
        publicCode: hold.publicCode,
        accessToken: hold.accessToken,
        amountPaise: hold.amountPaise,
        holdExpiresAt: hold.holdExpiresAt.toISOString(),
        razorpayOrderId: orderId,
        razorpayKeyId: env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      },
      { status: 201 },
    );
  } catch (e) {
    return jsonError(e);
  }
}
