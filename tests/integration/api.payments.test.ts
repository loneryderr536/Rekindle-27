import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, test } from "vitest";
import { db } from "@/db/client";
import { bookings, webhookEvents } from "@/db/schema";
import { POST as postVerify } from "@/app/api/payments/verify/route";
import { POST as postWebhook } from "@/app/api/webhooks/razorpay/route";
import { settleKickedOutbox } from "@/server/email/kickOutbox";
import { setEmailSenderForTests } from "@/server/email/sender";
import { setGatewayForTests } from "@/server/payments/gateway";
import { FakeEmailSender, FakeGateway } from "../helpers/fakes";
import { seedVenue } from "../helpers/db";
import { holdWithOrder } from "../helpers/holds";

// Read from .env.test (loaded in tests/setup.ts) so the tests sign with whatever secret the route verifies against.
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET as string;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET as string;

let gateway: FakeGateway;

beforeEach(() => {
  gateway = new FakeGateway();
  setGatewayForTests(gateway);
  // verify/webhook kick the outbox after confirming; never let that reach the real email provider.
  setEmailSenderForTests(new FakeEmailSender());
});
afterEach(async () => {
  await settleKickedOutbox();
  setGatewayForTests(null);
  setEmailSenderForTests(null);
});

const sign = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("hex");

function verify(body: unknown, headers: Record<string, string> = {}) {
  return postVerify(
    new Request("http://localhost/api/payments/verify", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

function verifyBody(orderId: string, paymentId: string, signature?: string) {
  return {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature ?? sign(KEY_SECRET, `${orderId}|${paymentId}`),
  };
}

type Fixture = "order.paid" | "payment.captured" | "payment.failed" | "refund.processed";

/** Loads a fixture and fills in the ids and amount for this test's booking. */
function fixture(name: Fixture, f: { orderId: string; paymentId: string; amount: number }): string {
  const ev = JSON.parse(readFileSync(join(__dirname, "../fixtures/razorpay", `${name}.json`), "utf8"));
  for (const key of ["payment", "order", "refund"] as const) {
    const e = ev.payload[key]?.entity;
    if (!e) continue;
    e.amount = f.amount;
    if (key === "payment") {
      e.id = f.paymentId;
      e.order_id = f.orderId;
    } else if (key === "order") {
      e.id = f.orderId;
    } else {
      e.payment_id = f.paymentId;
    }
  }
  return JSON.stringify(ev);
}

function webhook(raw: string, opts: { eventId?: string | null; signature?: string | null } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const signature = opts.signature === undefined ? sign(WEBHOOK_SECRET, raw) : opts.signature;
  if (signature !== null) headers["x-razorpay-signature"] = signature;
  if (opts.eventId) headers["x-razorpay-event-id"] = opts.eventId;
  return postWebhook(new Request("http://localhost/api/webhooks/razorpay", { method: "POST", headers, body: raw }));
}

async function setup(paymentId = "pay_test_1") {
  const { seats } = await seedVenue();
  const seatIds = [seats[0].id, seats[1].id];
  const h = await holdWithOrder(seatIds);
  return { ...h, seatIds, paymentId, f: { orderId: h.orderId, paymentId, amount: h.amountPaise } };
}

async function bookingOf(id: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, id));
  return b;
}

async function ticketCount(bookingId: string): Promise<number> {
  const { rows } = await db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM tickets WHERE booking_id = ${bookingId}`,
  );
  return rows[0].n;
}

async function outboxKinds(bookingId: string): Promise<string[]> {
  const { rows } = await db.execute<{ kind: string }>(
    sql`SELECT kind FROM email_outbox WHERE booking_id = ${bookingId} ORDER BY created_at`,
  );
  return rows.map((r) => r.kind);
}

test("verify with valid signature confirms", async () => {
  const h = await setup();
  gateway.setPayments(h.orderId, [{ id: h.paymentId, status: "captured", amount: h.amountPaise }]);
  const res = await verify(verifyBody(h.orderId, h.paymentId));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: "confirmed", accessToken: h.accessToken });
  expect((await bookingOf(h.bookingId)).status).toBe("paid");
  expect(await ticketCount(h.bookingId)).toBe(2);
});

test("verify with forged signature → 400 and booking still pending", async () => {
  const h = await setup();
  gateway.setPayments(h.orderId, [{ id: h.paymentId, status: "captured", amount: h.amountPaise }]);
  const res = await verify(verifyBody(h.orderId, h.paymentId, "0".repeat(64)));
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("BAD_SIGNATURE");
  expect((await bookingOf(h.bookingId)).status).toBe("pending");
  expect(await ticketCount(h.bookingId)).toBe(0);
});

test("verify with missing fields → 400 VALIDATION", async () => {
  const res = await verify({ razorpay_order_id: "order_x" });
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("VALIDATION");
});

test("verify uses the gateway amount, not anything from the browser", async () => {
  const h = await setup();
  gateway.setPayments(h.orderId, [{ id: h.paymentId, status: "captured", amount: 100 }]);
  const res = await verify({ ...verifyBody(h.orderId, h.paymentId), amount: h.amountPaise });
  expect(res.status).toBe(200);
  expect((await res.json()).status).toBe("refund_due");
  const b = await bookingOf(h.bookingId);
  expect(b.status).toBe("refund_due");
  expect(b.refundAmountPaise).toBe(100);
});

test("verify with a not-yet-captured payment → 202 pending", async () => {
  const h = await setup();
  gateway.setPayments(h.orderId, [{ id: h.paymentId, status: "authorized", amount: h.amountPaise }]);
  const res = await verify(verifyBody(h.orderId, h.paymentId));
  expect(res.status).toBe(202);
  expect(await res.json()).toEqual({ status: "pending", accessToken: h.accessToken });
  expect((await bookingOf(h.bookingId)).status).toBe("pending");
});

test("verify with a payment the gateway does not list → 202 pending", async () => {
  const h = await setup();
  const res = await verify(verifyBody(h.orderId, h.paymentId));
  expect(res.status).toBe(202);
  expect((await res.json()).status).toBe("pending");
});

test("verify for an unknown order → 404 UNKNOWN_ORDER", async () => {
  gateway.setPayments("order_nope", [{ id: "pay_x", status: "captured", amount: 100 }]);
  const res = await verify(verifyBody("order_nope", "pay_x"));
  expect(res.status).toBe(404);
  expect((await res.json()).error.code).toBe("UNKNOWN_ORDER");
});

test("verify is rate limited at 120 per IP", async () => {
  for (let i = 0; i < 120; i++) {
    expect((await verify({}, { "x-forwarded-for": "7.7.7.7" })).status).toBe(400);
  }
  const res = await verify({}, { "x-forwarded-for": "7.7.7.7" });
  expect(res.status).toBe(429);
  expect(res.headers.get("retry-after")).toBeTruthy();
});

test("webhook order.paid confirms booking", async () => {
  const h = await setup();
  const res = await webhook(fixture("order.paid", h.f), { eventId: "evt_1" });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, result: "confirmed" });
  expect((await bookingOf(h.bookingId)).status).toBe("paid");
  const events = await db.select().from(webhookEvents);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ razorpayEventId: "evt_1", eventType: "order.paid" });
});

test("duplicate webhook event id is ignored", async () => {
  const h = await setup();
  const raw = fixture("order.paid", h.f);
  expect((await webhook(raw, { eventId: "evt_dup" })).status).toBe(200);
  // Reset the booking to pending so a reprocess would be visible.
  await db.update(bookings).set({ status: "pending" }).where(eq(bookings.id, h.bookingId));
  const res = await webhook(raw, { eventId: "evt_dup" });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ duplicate: true });
  expect((await bookingOf(h.bookingId)).status).toBe("pending");
  expect(await db.select().from(webhookEvents)).toHaveLength(1);
});

test("webhook with bad signature → 400, nothing recorded", async () => {
  const h = await setup();
  const raw = fixture("order.paid", h.f);
  const res = await webhook(raw, { eventId: "evt_bad", signature: sign("wrong_secret", raw) });
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("BAD_SIGNATURE");
  expect(await db.select().from(webhookEvents)).toHaveLength(0);
  expect((await bookingOf(h.bookingId)).status).toBe("pending");
});

test("webhook with missing signature → 400", async () => {
  const h = await setup();
  const res = await webhook(fixture("order.paid", h.f), { signature: null });
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("BAD_SIGNATURE");
});

test("webhook signature is computed over the raw body", async () => {
  const h = await setup();
  const raw = fixture("order.paid", h.f);
  const reformatted = JSON.stringify(JSON.parse(raw), null, 2);
  const res = await webhook(reformatted, { signature: sign(WEBHOOK_SECRET, raw) });
  expect(res.status).toBe(400);
});

test("verify then webhook → one set of tickets", async () => {
  const h = await setup();
  gateway.setPayments(h.orderId, [{ id: h.paymentId, status: "captured", amount: h.amountPaise }]);
  expect((await verify(verifyBody(h.orderId, h.paymentId))).status).toBe(200);
  const res = await webhook(fixture("order.paid", h.f), { eventId: "evt_2" });
  expect(await res.json()).toEqual({ ok: true, result: "already_paid" });
  expect(await ticketCount(h.bookingId)).toBe(2);
  const { rows } = await db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM email_outbox WHERE booking_id = ${h.bookingId}`,
  );
  expect(rows[0].n).toBe(1);
});

test("payment.captured then order.paid for the same payment → one set of tickets", async () => {
  const h = await setup();
  const a = await webhook(fixture("payment.captured", h.f), { eventId: "evt_a" });
  expect(await a.json()).toEqual({ ok: true, result: "confirmed" });
  const b = await webhook(fixture("order.paid", h.f), { eventId: "evt_b" });
  expect(await b.json()).toEqual({ ok: true, result: "already_paid" });
  expect(await ticketCount(h.bookingId)).toBe(2);
});

test("webhook amount mismatch → booking refund_due", async () => {
  const h = await setup();
  const res = await webhook(fixture("payment.captured", { ...h.f, amount: h.amountPaise - 1 }), { eventId: "evt_m" });
  expect(await res.json()).toEqual({ ok: true, result: "refund_due" });
  const b = await bookingOf(h.bookingId);
  expect(b.status).toBe("refund_due");
  expect(b.refundAmountPaise).toBe(h.amountPaise - 1);
  expect(await ticketCount(h.bookingId)).toBe(0);
});

test("webhook for an unknown order → 200 unknown_order", async () => {
  const res = await webhook(fixture("payment.captured", { orderId: "order_nope", paymentId: "pay_x", amount: 100 }), {
    eventId: "evt_u",
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, result: "unknown_order" });
});

test("payment.failed leaves booking pending", async () => {
  const h = await setup();
  const res = await webhook(fixture("payment.failed", h.f), { eventId: "evt_f" });
  expect(res.status).toBe(200);
  expect((await bookingOf(h.bookingId)).status).toBe("pending");
  expect(await db.select().from(webhookEvents)).toHaveLength(1);
});

test("refund.processed marks a refund_due booking refunded", async () => {
  const h = await setup();
  await webhook(fixture("payment.captured", { ...h.f, amount: h.amountPaise - 1 }), { eventId: "evt_r1" });
  expect((await bookingOf(h.bookingId)).status).toBe("refund_due");
  const res = await webhook(fixture("refund.processed", h.f), { eventId: "evt_r2" });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, result: "refunded" });
  expect((await bookingOf(h.bookingId)).status).toBe("refunded");
  expect(await outboxKinds(h.bookingId)).toContain("refund_notice");
});

test("refund.processed for a full dashboard refund of a paid booking cancels it", async () => {
  const h = await setup();
  await webhook(fixture("payment.captured", h.f), { eventId: "evt_p" });
  expect(await ticketCount(h.bookingId)).toBe(2);
  const res = await webhook(fixture("refund.processed", h.f), { eventId: "evt_q" });
  expect(await res.json()).toEqual({ ok: true, result: "cancelled" });
  const b = await bookingOf(h.bookingId);
  expect(b.status).toBe("refunded");
  expect(b.refundAmountPaise).toBe(h.amountPaise);
  expect(await ticketCount(h.bookingId)).toBe(0);
  const { rows } = await db.execute<{ status: string; booking_id: string | null }>(
    sql`SELECT status, booking_id FROM seats WHERE id IN (${h.seatIds[0]}, ${h.seatIds[1]})`,
  );
  expect(rows).toEqual([{ status: "available", booking_id: null }, { status: "available", booking_id: null }]);
  expect(await outboxKinds(h.bookingId)).toEqual(expect.arrayContaining(["refund_notice"]));
});

test("refund.processed for a partial refund leaves a paid booking paid", async () => {
  const h = await setup();
  await webhook(fixture("payment.captured", h.f), { eventId: "evt_p" });
  const res = await webhook(fixture("refund.processed", { ...h.f, amount: 100 }), { eventId: "evt_q" });
  expect(await res.json()).toEqual({ ok: true, result: "partial" });
  expect((await bookingOf(h.bookingId)).status).toBe("paid");
  expect(await ticketCount(h.bookingId)).toBe(2);
});

test("unknown event type is recorded and ignored", async () => {
  const raw = JSON.stringify({ entity: "event", event: "payout.processed", payload: {} });
  const res = await webhook(raw, { eventId: "evt_o" });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, ignored: true });
  expect(await db.select().from(webhookEvents)).toHaveLength(1);
});

test("webhook without an event id header still processes, and records nothing", async () => {
  const h = await setup();
  const res = await webhook(fixture("order.paid", h.f));
  expect(res.status).toBe(200);
  expect((await bookingOf(h.bookingId)).status).toBe("paid");
  expect(await db.select().from(webhookEvents)).toHaveLength(0);
});

test("a signed payment event without a payment entity → 400 VALIDATION and is not recorded", async () => {
  const raw = JSON.stringify({ entity: "event", event: "payment.captured", payload: {} });
  const res = await webhook(raw, { eventId: "evt_x" });
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("VALIDATION");
  expect(await db.select().from(webhookEvents)).toHaveLength(0);
});
