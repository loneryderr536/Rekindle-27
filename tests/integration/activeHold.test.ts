import { expect, test } from "vitest";
import { DELETE as deleteCurrent, POST as postCurrent } from "@/app/api/holds/current/route";
import { createHold } from "@/server/holds/createHold";
import { confirmBooking } from "@/server/payments/confirmBooking";
import { seedVenue } from "../helpers/db";
import { guest, holdWithOrder, statusOf } from "../helpers/holds";

const MIN = 60_000;

function call(fn: (r: Request) => Promise<Response>, method: string, body: unknown) {
  return fn(new Request("http://localhost/api/holds/current", {
    method, headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
}

test("POST returns a pending hold so the page can resume it", async () => {
  const { seats } = await seedVenue();
  const h = await holdWithOrder([seats[0].id, seats[1].id]);
  const res = await call(postCurrent, "POST", { accessToken: h.accessToken });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({
    bookingId: h.bookingId,
    publicCode: h.publicCode,
    amountPaise: h.amountPaise,
    razorpayOrderId: h.orderId,
    razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    name: guest.name,
    email: guest.email,
    phone: guest.phone,
    holdExpiresAt: h.holdExpiresAt.toISOString(),
    seatIds: [seats[0].id, seats[1].id].sort(),
  });
});

test("POST → 404 for unknown, expired or paid holds", async () => {
  const { seats } = await seedVenue();
  expect((await call(postCurrent, "POST", { accessToken: "nope" })).status).toBe(404);

  const old = await holdWithOrder([seats[0].id], guest, new Date(Date.now() - 11 * MIN));
  expect((await call(postCurrent, "POST", { accessToken: old.accessToken })).status).toBe(404);

  const h = await holdWithOrder([seats[1].id], { ...guest, email: "b@example.com", phone: "+919811111111" });
  await confirmBooking({ orderId: h.orderId, paymentId: "pay_1", amountPaise: h.amountPaise });
  const res = await call(postCurrent, "POST", { accessToken: h.accessToken });
  expect(res.status).toBe(404);
  expect((await res.json()).error.code).toBe("NO_ACTIVE_HOLD");
});

test("DELETE releases the seats and lets the guest hold again at once", async () => {
  const { seats } = await seedVenue();
  const h = await holdWithOrder([seats[0].id]);
  const res = await call(deleteCurrent, "DELETE", { accessToken: h.accessToken });
  expect(await res.json()).toEqual({ released: true });
  expect(await statusOf(seats[0].id)).toBe("available");
  expect((await call(deleteCurrent, "DELETE", { accessToken: h.accessToken })).status).toBe(200);
  expect(await (await call(deleteCurrent, "DELETE", { accessToken: h.accessToken })).json()).toEqual({ released: false });
  // No ACTIVE_HOLD_EXISTS: the released hold no longer counts.
  const again = await createHold({ seatIds: [seats[0].id], ...guest });
  expect(again.amountPaise).toBeGreaterThan(0);
});

test("DELETE does not touch a paid booking", async () => {
  const { seats } = await seedVenue();
  const h = await holdWithOrder([seats[0].id]);
  await confirmBooking({ orderId: h.orderId, paymentId: "pay_1", amountPaise: h.amountPaise });
  expect(await (await call(deleteCurrent, "DELETE", { accessToken: h.accessToken })).json()).toEqual({ released: false });
  expect(await statusOf(seats[0].id)).toBe("sold");
});

test("a payment that lands after the guest released the hold is refunded", async () => {
  const { seats } = await seedVenue();
  const h = await holdWithOrder([seats[0].id]);
  await call(deleteCurrent, "DELETE", { accessToken: h.accessToken });
  expect(await confirmBooking({ orderId: h.orderId, paymentId: "pay_late", amountPaise: h.amountPaise })).toBe("refund_due");
});
