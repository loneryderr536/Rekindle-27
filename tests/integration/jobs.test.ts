import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { db } from "@/db/client";
import { bookings, emailOutbox, seats as seatsTable, tickets } from "@/db/schema";
import { GET as cronCleanupGet, POST as cronCleanupPost } from "@/app/api/cron/cleanup/route";
import { GET as cronOutbox } from "@/app/api/cron/outbox/route";
import { POST as cronReconcile } from "@/app/api/cron/reconcile/route";
import { HOLD_MINUTES } from "@/lib/constants";
import { releaseExpiredHolds } from "@/server/jobs/cleanup";
import { reconcilePending } from "@/server/jobs/reconcile";
import { confirmBooking } from "@/server/payments/confirmBooking";
import { setGatewayForTests } from "@/server/payments/gateway";
import { rateLimit } from "@/server/security/rateLimit";
import { resetDb, seedVenue } from "../helpers/db";
import { FakeGateway } from "../helpers/fakes";
import { guestN, holdWithOrder, statusOf } from "../helpers/holds";

const MIN = 60_000;
const past = (minutes: number) => new Date(Date.now() - minutes * MIN);

async function bookingStatus(id: string) {
  const [b] = await db.select({ status: bookings.status }).from(bookings).where(eq(bookings.id, id));
  return b.status;
}

/** A hold created long enough ago that it has expired. */
const expiredHold = (seatIds: string[], i = 1) => holdWithOrder(seatIds, guestN(i), past(HOLD_MINUTES + 5));

let gateway: FakeGateway;
beforeEach(() => {
  gateway = new FakeGateway();
  setGatewayForTests(gateway);
});
afterEach(() => setGatewayForTests(null));

test("releaseExpiredHolds frees seats and marks expired", async () => {
  const v = await seedVenue();
  const b = await expiredHold([v.seats[0].id, v.seats[1].id]);
  expect(await releaseExpiredHolds()).toEqual({ released: 1, purgedRateLimits: 0 });
  expect(await bookingStatus(b.bookingId)).toBe("expired");
  expect(await statusOf(v.seats[0].id)).toBe("available");
  expect(await statusOf(v.seats[1].id)).toBe("available");
  // Idempotent.
  expect((await releaseExpiredHolds()).released).toBe(0);
});

test("releaseExpiredHolds ignores paid bookings and live holds", async () => {
  const v = await seedVenue();
  const paid = await expiredHold([v.seats[0].id], 1);
  await confirmBooking({ orderId: paid.orderId, paymentId: "pay_1", amountPaise: paid.amountPaise });
  const live = await holdWithOrder([v.seats[1].id], guestN(2));

  expect((await releaseExpiredHolds()).released).toBe(0);
  expect(await bookingStatus(paid.bookingId)).toBe("paid");
  expect(await statusOf(v.seats[0].id)).toBe("sold");
  expect(await bookingStatus(live.bookingId)).toBe("pending");
  expect(await statusOf(v.seats[1].id)).toBe("held");
});

test("releaseExpiredHolds treats the expiry instant as expired", async () => {
  const v = await seedVenue();
  const b = await holdWithOrder([v.seats[0].id], guestN(1));
  const [row] = await db.select({ at: bookings.holdExpiresAt }).from(bookings).where(eq(bookings.id, b.bookingId));
  expect((await releaseExpiredHolds(new Date(row.at.getTime() - 1))).released).toBe(0);
  expect((await releaseExpiredHolds(row.at)).released).toBe(1);
});

test("releaseExpiredHolds leaves a seat re-held by a new booking intact", async () => {
  const v = await seedVenue();
  const old = await expiredHold([v.seats[0].id, v.seats[1].id], 1);
  // createHold may take seats whose hold ran out even while the old booking is still pending.
  const fresh = await holdWithOrder([v.seats[0].id], guestN(2));
  expect((await releaseExpiredHolds()).released).toBe(1);
  expect(await bookingStatus(old.bookingId)).toBe("expired");
  expect(await bookingStatus(fresh.bookingId)).toBe("pending");
  expect(await statusOf(v.seats[0].id)).toBe("held");
  expect(await statusOf(v.seats[1].id)).toBe("available");
  const [s0] = await db.select().from(seatsTable).where(eq(seatsTable.id, v.seats[0].id));
  expect(s0.bookingId).toBe(fresh.bookingId);
});

test("releaseExpiredHolds vs concurrent createHold on overlapping expired seats: no deadlock", async () => {
  for (let i = 0; i < 10; i++) {
    await resetDb();
    const v = await seedVenue({ seatsPerTier: 6 });
    const ids = v.seats.slice(0, 5).map((s) => s.id);
    await expiredHold(ids, 1);
    const results = await Promise.allSettled([
      releaseExpiredHolds(),
      holdWithOrder([...ids].reverse().slice(0, 3), guestN(2)),
      holdWithOrder(ids.slice(2), guestN(3)),
    ]);
    for (const r of results) {
      if (r.status === "rejected") expect(String((r.reason as Error).cause ?? r.reason)).not.toMatch(/deadlock/);
    }
  }
});

test("releaseExpiredHolds purges rate_limits older than 24h and keeps current ones", async () => {
  const now = new Date();
  await rateLimit("old", 5, 60, new Date(now.getTime() - 25 * 60 * MIN));
  await rateLimit("recent", 5, 60, new Date(now.getTime() - 23 * 60 * MIN));
  await rateLimit("current", 5, 60, now);
  expect((await releaseExpiredHolds(now)).purgedRateLimits).toBe(1);
  const keys = (await db.execute<{ key: string }>(sql`SELECT key FROM rate_limits ORDER BY key`)).rows.map((r) => r.key);
  expect(keys).toEqual(["current", "recent"]);
});

test("releaseExpiredHolds vs concurrent confirmBooking: no deadlock, consistent end state", async () => {
  for (let i = 0; i < 10; i++) {
    await resetDb();
    const v = await seedVenue({ seatsPerTier: 4 });
    const seatIds = [v.seats[0].id, v.seats[1].id, v.seats[2].id];
    const b = await expiredHold(seatIds);
    const now = new Date();
    const [, confirmed] = await Promise.all([
      releaseExpiredHolds(now),
      confirmBooking({ orderId: b.orderId, paymentId: `pay_c${i}`, amountPaise: b.amountPaise }, now),
    ]);
    const status = await bookingStatus(b.bookingId);
    if (confirmed === "confirmed") {
      expect(status).toBe("paid");
      expect(await db.select().from(tickets).where(eq(tickets.bookingId, b.bookingId))).toHaveLength(3);
      for (const id of seatIds) expect(await statusOf(id)).toBe("sold");
    } else {
      expect(confirmed).toBe("refund_due");
      expect(status).toBe("refund_due");
      for (const id of seatIds) expect(await statusOf(id)).toBe("available");
      expect(await db.select().from(tickets).where(eq(tickets.bookingId, b.bookingId))).toHaveLength(0);
    }
    const stray = await db.select().from(seatsTable).where(eq(seatsTable.bookingId, b.bookingId));
    expect(stray.every((s) => s.status === "sold")).toBe(true);
  }
});

test("reconcile confirms booking whose webhook never arrived", async () => {
  const v = await seedVenue();
  const b = await holdWithOrder([v.seats[0].id], guestN(1));
  gateway.setPayments(b.orderId, [
    { id: "pay_f", status: "failed", amount: b.amountPaise },
    { id: "pay_ok", status: "captured", amount: b.amountPaise },
  ]);
  expect(await reconcilePending(gateway)).toEqual({ confirmed: 1, checked: 1, refunded: 0 });
  expect(await bookingStatus(b.bookingId)).toBe("paid");
  expect(await statusOf(v.seats[0].id)).toBe("sold");
  const [row] = await db.select().from(bookings).where(eq(bookings.id, b.bookingId));
  expect(row.razorpayPaymentId).toBe("pay_ok");
  const outbox = await db.select().from(emailOutbox).where(eq(emailOutbox.bookingId, b.bookingId));
  expect(outbox.map((o) => o.kind)).toEqual(["tickets"]);
  // Second run is a no-op.
  expect(await reconcilePending(gateway)).toEqual({ confirmed: 0, checked: 0, refunded: 0 });
});

test("reconcile confirms an expired booking whose seats are still free of other holders", async () => {
  const v = await seedVenue();
  const b = await expiredHold([v.seats[0].id]);
  // Expired status but seats still attached (cleanup has not run yet).
  await db.execute(sql`UPDATE bookings SET status = 'expired' WHERE id = ${b.bookingId}`);
  gateway.setPayments(b.orderId, [{ id: "pay_ok", status: "captured", amount: b.amountPaise }]);
  expect((await reconcilePending(gateway)).confirmed).toBe(1);
  expect(await bookingStatus(b.bookingId)).toBe("paid");
});

test("reconcile on expired booking whose seats were re-sold → refund issued", async () => {
  const v = await seedVenue();
  const first = await expiredHold([v.seats[0].id], 1);
  await releaseExpiredHolds();
  const second = await holdWithOrder([v.seats[0].id], guestN(2));
  gateway.setPayments(first.orderId, [{ id: "pay_late", status: "captured", amount: first.amountPaise }]);

  expect(await reconcilePending(gateway)).toEqual({ confirmed: 0, checked: 2, refunded: 1 });
  expect(gateway.refunds).toEqual([{ paymentId: "pay_late", amountPaise: first.amountPaise, id: expect.any(String) }]);
  expect(await bookingStatus(first.bookingId)).toBe("refunded");
  // The new holder is untouched.
  expect(await bookingStatus(second.bookingId)).toBe("pending");
  expect(await statusOf(v.seats[0].id)).toBe("held");
});

test("reconcile skips bookings older than 24h and without captured payments", async () => {
  const v = await seedVenue();
  const old = await holdWithOrder([v.seats[0].id], guestN(1));
  await db.execute(sql`UPDATE bookings SET created_at = now() - interval '25 hours' WHERE id = ${old.bookingId}`);
  gateway.setPayments(old.orderId, [{ id: "pay_old", status: "captured", amount: old.amountPaise }]);
  const unpaid = await holdWithOrder([v.seats[1].id], guestN(2));
  gateway.setPayments(unpaid.orderId, [{ id: "pay_a", status: "authorized", amount: unpaid.amountPaise }]);

  expect(await reconcilePending(gateway)).toEqual({ confirmed: 0, checked: 1, refunded: 0 });
  expect(await bookingStatus(old.bookingId)).toBe("pending");
  expect(await bookingStatus(unpaid.bookingId)).toBe("pending");
});

test("reconcile logs and skips a gateway error on one booking", async () => {
  const v = await seedVenue();
  const bad = await holdWithOrder([v.seats[0].id], guestN(1));
  const good = await holdWithOrder([v.seats[1].id], guestN(2));
  gateway.setPayments(good.orderId, [{ id: "pay_ok", status: "captured", amount: good.amountPaise }]);
  const real = gateway.fetchOrderPayments.bind(gateway);
  gateway.fetchOrderPayments = async (orderId: string) => {
    if (orderId === bad.orderId) throw new Error("boom");
    return real(orderId);
  };
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(await reconcilePending(gateway)).toEqual({ confirmed: 1, checked: 2, refunded: 0 });
    expect(log).toHaveBeenCalledTimes(1);
  } finally {
    log.mockRestore();
  }
  expect(await bookingStatus(bad.bookingId)).toBe("pending");
  expect(await bookingStatus(good.bookingId)).toBe("paid");
});

test("reconcile recovers a stuck refund (gateway already refunded) without refunding again", async () => {
  const v = await seedVenue();
  const b = await holdWithOrder([v.seats[0].id], guestN(1));
  expect(await confirmBooking({ orderId: b.orderId, paymentId: "pay_x", amountPaise: b.amountPaise + 1 })).toBe("refund_due");
  gateway.setPayments(b.orderId, [{ id: "pay_x", status: "refunded", amount: b.amountPaise + 1 }]);

  expect(await reconcilePending(gateway)).toEqual({ confirmed: 0, checked: 0, refunded: 1 });
  expect(gateway.refunds).toHaveLength(0);
  expect(await bookingStatus(b.bookingId)).toBe("refunded");
  const outbox = await db.select().from(emailOutbox).where(eq(emailOutbox.bookingId, b.bookingId));
  expect(outbox.map((o) => [o.kind, o.status])).toEqual([["refund_notice", "pending"]]);
  // Nothing more on a second run.
  expect(await reconcilePending(gateway)).toEqual({ confirmed: 0, checked: 0, refunded: 0 });
  expect(await db.select().from(emailOutbox).where(eq(emailOutbox.bookingId, b.bookingId))).toHaveLength(1);
});

// ---- cron routes ----

const url = (name: string) => `http://localhost/api/cron/${name}`;

test("cron route without secret → 401", async () => {
  const bad: Record<string, string>[] = [{}, { "x-cron-secret": "wrong" }, { "x-cron-secret": "test_cron_x" }, { authorization: "Bearer nope" }, { authorization: "test_cron" }];
  for (const headers of bad) {
    const res = await cronCleanupPost(new Request(url("cleanup"), { method: "POST", headers }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: "UNAUTHORIZED", message: expect.any(String) } });
  }
  expect((await cronReconcile(new Request(url("reconcile"), { method: "POST" }))).status).toBe(401);
  expect((await cronOutbox(new Request(url("outbox")))).status).toBe(401);
});

test("cron routes accept x-cron-secret and Bearer (GET and POST) and return the job result", async () => {
  const v = await seedVenue();
  await expiredHold([v.seats[0].id]);
  const res = await cronCleanupPost(new Request(url("cleanup"), { method: "POST", headers: { "x-cron-secret": "test_cron" } }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ released: 1, purgedRateLimits: 0 });

  const res2 = await cronCleanupGet(new Request(url("cleanup"), { headers: { authorization: "Bearer test_cron" } }));
  expect(res2.status).toBe(200);
  expect(await res2.json()).toEqual({ released: 0, purgedRateLimits: 0 });

  const res3 = await cronReconcile(new Request(url("reconcile"), { method: "POST", headers: { "x-cron-secret": "test_cron" } }));
  expect(res3.status).toBe(200);
  expect(await res3.json()).toEqual({ confirmed: 0, checked: 1, refunded: 0 });

  const res4 = await cronOutbox(new Request(url("outbox"), { headers: { "x-cron-secret": "test_cron" } }));
  expect(res4.status).toBe(200);
  expect(await res4.json()).toEqual({ sent: 0, failed: 0 });
});
