import { eq, sql } from "drizzle-orm";
import { expect, test, vi } from "vitest";
import { db } from "@/db/client";
import { bookings, emailOutbox } from "@/db/schema";
import { confirmBooking } from "@/server/payments/confirmBooking";
import { processRefunds } from "@/server/payments/refunds";
import { seedVenue } from "../helpers/db";
import { FakeGateway } from "../helpers/fakes";
import { guestN, holdWithOrder } from "../helpers/holds";

/** A refund_due booking produced by a mismatched payment of booking amount + `delta`. */
async function refundDueBooking(i: number, seatId: string, paymentId: string, delta = 1) {
  const b = await holdWithOrder([seatId], guestN(i));
  const paidAmount = b.amountPaise + delta;
  expect(await confirmBooking({ orderId: b.orderId, paymentId, amountPaise: paidAmount })).toBe("refund_due");
  return { ...b, paidAmount };
}

async function statusOfBooking(id: string) {
  const [b] = await db.select({ status: bookings.status }).from(bookings).where(eq(bookings.id, id));
  return b.status;
}

async function outboxKinds(bookingId: string) {
  const rows = await db.select().from(emailOutbox).where(eq(emailOutbox.bookingId, bookingId));
  return rows.map((r) => [r.kind, r.status]);
}

test.each([
  ["underpaid", -1],
  ["overpaid", 5000],
])("processRefunds refunds the full paid amount (%s) and marks refunded", async (_label, delta) => {
  const v = await seedVenue();
  const b = await refundDueBooking(1, v.seats[0].id, "pay_r1", delta);
  const paid = await holdWithOrder([v.seats[1].id], guestN(2));
  await confirmBooking({ orderId: paid.orderId, paymentId: "pay_ok", amountPaise: paid.amountPaise });

  const gw = new FakeGateway();
  expect(await processRefunds(gw)).toEqual({ refunded: 1, failed: 0 });
  expect(b.paidAmount).not.toBe(b.amountPaise);
  expect(gw.refunds).toEqual([{ paymentId: "pay_r1", amountPaise: b.paidAmount, id: expect.any(String) }]);
  expect(await statusOfBooking(b.bookingId)).toBe("refunded");
  expect(await outboxKinds(b.bookingId)).toEqual([["refund_notice", "pending"]]);

  // Already refunded: nothing more to do.
  expect(await processRefunds(gw)).toEqual({ refunded: 0, failed: 0 });
  expect(gw.refunds).toHaveLength(1);
});

test("processRefunds leaves refund_due on gateway error", async () => {
  const v = await seedVenue();
  const first = await refundDueBooking(1, v.seats[0].id, "pay_r1");
  const second = await refundDueBooking(2, v.seats[1].id, "pay_r2");

  const gw = new FakeGateway();
  gw.failNextRefund();
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(await processRefunds(gw)).toEqual({ refunded: 1, failed: 1 });
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toMatch(/gateway refund failed: FakeGateway: refund failed/);
  } finally {
    log.mockRestore();
  }
  const statuses = [await statusOfBooking(first.bookingId), await statusOfBooking(second.bookingId)].sort();
  expect(statuses).toEqual(["refund_due", "refunded"]);
  const failedId = (await statusOfBooking(first.bookingId)) === "refund_due" ? first.bookingId : second.bookingId;
  expect(await outboxKinds(failedId)).toEqual([]);

  // A later run retries the failed one.
  expect(await processRefunds(gw)).toEqual({ refunded: 1, failed: 0 });
  expect(await statusOfBooking(failedId)).toBe("refunded");
  expect(gw.refunds).toHaveLength(2);
});

test("processRefunds skips refund_due bookings with no recorded refund amount", async () => {
  const v = await seedVenue();
  const b = await refundDueBooking(1, v.seats[0].id, "pay_r1");
  await db.execute(sql`UPDATE bookings SET refund_amount_paise = NULL WHERE id = ${b.bookingId}`);

  const gw = new FakeGateway();
  expect(await processRefunds(gw)).toEqual({ refunded: 0, failed: 0 });
  expect(gw.refunds).toEqual([]);
  expect(await statusOfBooking(b.bookingId)).toBe("refund_due");
});
