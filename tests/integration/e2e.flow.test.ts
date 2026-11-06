import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test } from "vitest";
import { db } from "@/db/client";
import { adminUsers, bookings, tickets } from "@/db/schema";
import { POST as postHold } from "@/app/api/holds/route";
import { POST as postVerify } from "@/app/api/payments/verify/route";
import { POST as postScan } from "@/app/api/scan/route";
import { createSession, SESSION_COOKIE } from "@/server/auth/session";
import { processOutbox } from "@/server/email/outbox";
import { setEmailSenderForTests } from "@/server/email/sender";
import { settleKickedOutbox } from "@/server/email/kickOutbox";
import { setGatewayForTests } from "@/server/payments/gateway";
import { qrPayload } from "@/server/tickets/tokens";
import { assertNoDoubleBooking } from "../helpers/doubleBooking";
import { seedVenue } from "../helpers/db";
import { FakeEmailSender, FakeGateway } from "../helpers/fakes";
import { guest, guestN } from "../helpers/holds";

/** Browser-free walk through the real route handlers, in the order a guest and a gate scanner hit them. */

const ORIGIN = "http://localhost:3000";

let gateway: FakeGateway;
let sender: FakeEmailSender;

beforeEach(() => {
  gateway = new FakeGateway();
  sender = new FakeEmailSender();
  setGatewayForTests(gateway);
  setEmailSenderForTests(sender);
});
afterEach(async () => {
  await settleKickedOutbox();
  setGatewayForTests(null);
  setEmailSenderForTests(null);
});

let ipCounter = 0;
function holdRequest(seatCount: number, who: { name: string; email: string; phone: string }) {
  ipCounter += 1;
  return postHold(
    new Request(`${ORIGIN}/api/holds`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.1.0.${ipCounter}` },
      body: JSON.stringify({ seatCount, ...who, turnstileToken: "test-pass" }),
    }),
  );
}

function signature(orderId: string, paymentId: string): string {
  return createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!).update(`${orderId}|${paymentId}`).digest("hex");
}

async function scannerCookie(): Promise<string> {
  const [u] = await db
    .insert(adminUsers)
    .values({ email: "gate@example.com", role: "scanner", passwordHash: "x" })
    .returning();
  return `${SESSION_COOKIE}=${await createSession(u.id)}`;
}

function scanRequest(cookie: string, payload: string) {
  return postScan(
    new Request(`${ORIGIN}/api/scan`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, cookie },
      body: JSON.stringify({ payload, gate: "Gate A" }),
    }),
  );
}

test("guest books 2 seats, pays, receives QR emails, gate scan is ok then already", async () => {
  await seedVenue();

  // Hold: the guest only enters a seat count, the server picks the seats
  const holdRes = await holdRequest(2, guest);
  expect(holdRes.status).toBe(201);
  const hold = (await holdRes.json()) as { bookingId: string; razorpayOrderId: string; amountPaise: number; accessToken: string };
  expect(hold.razorpayOrderId).toBe("order_test_1");
  expect(hold.amountPaise).toBe(300000);

  // Checkout succeeds: Razorpay reports the payment captured and the browser posts the signed result
  const paymentId = "pay_e2e_1";
  gateway.setPayments(hold.razorpayOrderId, [{ id: paymentId, status: "captured", amount: hold.amountPaise }]);
  const verifyRes = await postVerify(
    new Request(`${ORIGIN}/api/payments/verify`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.9" },
      body: JSON.stringify({
        razorpay_order_id: hold.razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature(hold.razorpayOrderId, paymentId),
      }),
    }),
  );
  expect(verifyRes.status).toBe(200);
  expect(await verifyRes.json()).toEqual({ status: "confirmed", accessToken: hold.accessToken });
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, hold.bookingId));
  expect(booking.status).toBe("paid");

  // Outbox: exactly one tickets email, two QR attachments (verify already kicked it; a rerun is a no-op)
  await settleKickedOutbox();
  await processOutbox();
  expect(await processOutbox()).toEqual({ sent: 0, failed: 0 });
  expect(sender.sent).toHaveLength(1);
  expect(sender.sent[0].to).toBe(guest.email);
  expect(sender.sent[0].attachments).toHaveLength(2);

  // The QR text is "RKT1:<token>" for a stored ticket
  const rows = await db.select().from(tickets).where(eq(tickets.bookingId, hold.bookingId));
  expect(rows).toHaveLength(2);
  const payload = qrPayload(rows[0].token);

  // Gate scan: green, then already
  const cookie = await scannerCookie();
  const first = await scanRequest(cookie, payload);
  expect(first.status).toBe(200);
  expect(await first.json()).toMatchObject({ result: "ok", firstName: "Asha" });
  const second = await scanRequest(cookie, payload);
  expect(second.status).toBe(200);
  expect(await second.json()).toMatchObject({ result: "already", gate: "Gate A" });

  // The other ticket of the booking is still unused
  const other = await scanRequest(cookie, qrPayload(rows[1].token));
  expect(await other.json()).toMatchObject({ result: "ok" });

  await assertNoDoubleBooking();
});

test("two guests race for the last seat in the tier: one 201, one 409", async () => {
  await seedVenue({ seatsPerTier: 1 });
  const [a, b] = await Promise.all([holdRequest(1, guestN(1)), holdRequest(1, guestN(2))]);
  expect([a.status, b.status].sort()).toEqual([201, 409]);
  const loser = a.status === 409 ? a : b;
  expect(((await loser.json()) as { error: { code: string } }).error.code).toBe("NOT_ENOUGH_SEATS");
  await assertNoDoubleBooking();
});
