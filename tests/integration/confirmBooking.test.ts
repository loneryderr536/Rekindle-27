import { eq, sql } from "drizzle-orm";
import { expect, test } from "vitest";
import { db } from "@/db/client";
import { bookings, emailOutbox, seats, tickets } from "@/db/schema";
import { createHold } from "@/server/holds/createHold";
import { confirmBooking } from "@/server/payments/confirmBooking";
import { parseQrPayload, qrPayload } from "@/server/tickets/tokens";
import { seedVenue } from "../helpers/db";
import { guestN, holdWithOrder } from "../helpers/holds";

const MIN = 60_000;

async function seatIds(n: number): Promise<string[]> {
  const v = await seedVenue();
  return v.seats.slice(0, n).map((s) => s.id);
}

async function seatRows(ids: string[]) {
  const rows = await db.select().from(seats);
  return ids.map((id) => rows.find((r) => r.id === id)!);
}

async function bookingRow(id: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, id));
  return b;
}

async function ticketsOf(bookingId: string) {
  return db.select().from(tickets).where(eq(tickets.bookingId, bookingId));
}

async function outboxKinds(bookingId: string): Promise<string[]> {
  const rows = await db.select().from(emailOutbox).where(eq(emailOutbox.bookingId, bookingId));
  return rows.map((r) => r.kind);
}

test("confirms held booking: seats sold, tickets created, outbox row", async () => {
  const ids = await seatIds(2);
  const b = await holdWithOrder(ids);
  const now = new Date();
  expect(await confirmBooking({ orderId: b.orderId, paymentId: "pay_1", amountPaise: b.amountPaise }, now)).toBe("confirmed");

  const rows = await seatRows(ids);
  expect(rows.map((s) => s.status)).toEqual(["sold", "sold"]);
  for (const s of rows) {
    expect(s.bookingId).toBe(b.bookingId);
    expect(s.heldUntil).toBeNull();
  }
  const ts = await ticketsOf(b.bookingId);
  expect(ts.map((t) => t.seatId).sort()).toEqual([...ids].sort());
  for (const t of ts) expect(t.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(new Set(ts.map((t) => t.token)).size).toBe(2);
  expect(await outboxKinds(b.bookingId)).toEqual(["tickets"]);
  const [ob] = await db.select().from(emailOutbox).where(eq(emailOutbox.bookingId, b.bookingId));
  expect(ob.status).toBe("pending");

  const booking = await bookingRow(b.bookingId);
  expect(booking.status).toBe("paid");
  expect(booking.razorpayPaymentId).toBe("pay_1");
  expect(booking.paidAt!.getTime()).toBe(now.getTime());
});

test("second call returns already_paid and creates no new tickets", async () => {
  const ids = await seatIds(2);
  const b = await holdWithOrder(ids);
  const p = { orderId: b.orderId, paymentId: "pay_1", amountPaise: b.amountPaise };
  expect(await confirmBooking(p)).toBe("confirmed");
  const before = await ticketsOf(b.bookingId);
  expect(await confirmBooking(p)).toBe("already_paid");
  const after = await ticketsOf(b.bookingId);
  expect(after.map((t) => t.token).sort()).toEqual(before.map((t) => t.token).sort());
  expect(await outboxKinds(b.bookingId)).toEqual(["tickets"]);
});

test("10 parallel confirms → 1 confirmed, 9 already_paid, 2 tickets", async () => {
  const ids = await seatIds(2);
  const b = await holdWithOrder(ids);
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      confirmBooking({ orderId: b.orderId, paymentId: "pay_1", amountPaise: b.amountPaise })),
  );
  expect(results.filter((r) => r === "confirmed")).toHaveLength(1);
  expect(results.filter((r) => r === "already_paid")).toHaveLength(9);
  expect(await ticketsOf(b.bookingId)).toHaveLength(ids.length);
  expect(await outboxKinds(b.bookingId)).toEqual(["tickets"]);
});

test("late payment, seats untouched → confirmed", async () => {
  const ids = await seatIds(2);
  const t0 = new Date(Date.now() - 30 * MIN);
  const b = await holdWithOrder(ids, guestN(1), t0);
  // Hold is long past held_until; cleanup has even marked the booking expired, seats still attached.
  await db.update(bookings).set({ status: "expired" }).where(eq(bookings.id, b.bookingId));
  expect(await confirmBooking({ orderId: b.orderId, paymentId: "pay_late", amountPaise: b.amountPaise })).toBe("confirmed");
  expect((await seatRows(ids)).map((s) => s.status)).toEqual(["sold", "sold"]);
  expect(await ticketsOf(b.bookingId)).toHaveLength(2);
  expect((await bookingRow(b.bookingId)).status).toBe("paid");
});

test("late payment, seats re-held by someone else → refund_due; other user's hold intact", async () => {
  const ids = await seatIds(3);
  const t0 = new Date(Date.now() - 30 * MIN);
  const b = await holdWithOrder(ids.slice(0, 2), guestN(1), t0);
  // Someone else takes one of the expired seats.
  const other = await createHold({ seatIds: [ids[1], ids[2]], ...guestN(2) });

  expect(await confirmBooking({ orderId: b.orderId, paymentId: "pay_late", amountPaise: b.amountPaise })).toBe("refund_due");

  const [s0, s1, s2] = await seatRows(ids);
  expect(s0).toMatchObject({ status: "available", bookingId: null, heldUntil: null });
  expect(s1).toMatchObject({ status: "held", bookingId: other.bookingId });
  expect(s1.heldUntil!.getTime()).toBe(other.holdExpiresAt.getTime());
  expect(s2).toMatchObject({ status: "held", bookingId: other.bookingId });

  const booking = await bookingRow(b.bookingId);
  expect(booking.status).toBe("refund_due");
  expect(booking.razorpayPaymentId).toBe("pay_late");
  expect(booking.refundAmountPaise).toBe(b.amountPaise);
  expect(booking.paidAt).toBeNull();
  expect(await ticketsOf(b.bookingId)).toHaveLength(0);
  expect(await outboxKinds(b.bookingId)).toEqual([]);

  // Repeat delivery of the same payment is a no-op.
  expect(await confirmBooking({ orderId: b.orderId, paymentId: "pay_late", amountPaise: b.amountPaise })).toBe("refund_due");
  expect(await ticketsOf(b.bookingId)).toHaveLength(0);
});

test.each([
  ["underpaid", -1],
  ["overpaid", 5000],
])("amount mismatch (%s) → refund_due with the paid amount, seats released, no tickets", async (_label, delta) => {
  const ids = await seatIds(2);
  const b = await holdWithOrder(ids);
  const paid = b.amountPaise + delta;
  expect(await confirmBooking({ orderId: b.orderId, paymentId: "pay_x", amountPaise: paid })).toBe("refund_due");

  for (const s of await seatRows(ids)) {
    expect(s).toMatchObject({ status: "available", bookingId: null, heldUntil: null });
  }
  expect(await ticketsOf(b.bookingId)).toHaveLength(0);
  expect(await outboxKinds(b.bookingId)).toEqual([]);
  const booking = await bookingRow(b.bookingId);
  expect(booking.status).toBe("refund_due");
  expect(booking.razorpayPaymentId).toBe("pay_x");
  expect(booking.refundAmountPaise).toBe(paid);
  expect(booking.amountPaise).toBe(b.amountPaise);
});

test("unknown order → unknown_order", async () => {
  const ids = await seatIds(1);
  const b = await holdWithOrder(ids);
  expect(await confirmBooking({ orderId: "order_nope", paymentId: "pay_1", amountPaise: b.amountPaise })).toBe("unknown_order");
  expect((await bookingRow(b.bookingId)).status).toBe("pending");
  expect((await seatRows(ids))[0].status).toBe("held");
});

test("comp booking is treated as already_paid without writes", async () => {
  const ids = await seatIds(1);
  const b = await holdWithOrder(ids);
  await db.execute(sql`UPDATE bookings SET status = 'comp' WHERE id = ${b.bookingId}`);
  expect(await confirmBooking({ orderId: b.orderId, paymentId: "pay_1", amountPaise: b.amountPaise })).toBe("already_paid");
  expect(await ticketsOf(b.bookingId)).toHaveLength(0);
  expect((await bookingRow(b.bookingId)).razorpayPaymentId).toBeNull();
});

test("parseQrPayload rejects other prefixes", () => {
  const token = "a".repeat(43);
  expect(qrPayload(token)).toBe(`RKT1:${token}`);
  expect(parseQrPayload(`RKT1:${token}`)).toBe(token);
  expect(parseQrPayload(`RKT2:${token}`)).toBeNull();
  expect(parseQrPayload(token)).toBeNull();
  expect(parseQrPayload(`RKT1:${token}x`)).toBeNull();
  expect(parseQrPayload(`RKT1:${"a".repeat(42)}+`)).toBeNull();
  expect(parseQrPayload(` RKT1:${token}`)).toBeNull();
  expect(parseQrPayload(`RKT1:${token}\n`)).toBeNull();
});
