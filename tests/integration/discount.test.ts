import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test } from "vitest";
import { db } from "@/db/client";
import { bookings, discountCodes } from "@/db/schema";
import { POST as postHold } from "@/app/api/holds/route";
import { POST as postValidate } from "@/app/api/discount/validate/route";
import { AppError } from "@/lib/errors";
import { createHold } from "@/server/holds/createHold";
import { setGatewayForTests } from "@/server/payments/gateway";
import { FakeGateway } from "../helpers/fakes";
import { seedVenue } from "../helpers/db";
import { guest, guestN, statusOf } from "../helpers/holds";

let gateway: FakeGateway;
beforeEach(async () => {
  gateway = new FakeGateway();
  setGatewayForTests(gateway);
  await db.insert(discountCodes).values([
    { code: "REKINDLE10", percent: 10 },
    { code: "REKINDLE20", percent: 20 },
  ]);
});
afterEach(() => setGatewayForTests(null));

function hold(body: unknown) {
  return postHold(
    new Request("http://localhost/api/holds", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
      body: JSON.stringify(body),
    }),
  );
}
function validate(body: unknown) {
  return postValidate(
    new Request("http://localhost/api/discount/validate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
      body: JSON.stringify(body),
    }),
  );
}

test("a code takes its percentage off the seat total and the Razorpay order", async () => {
  const { seats } = await seedVenue(); // Gold 150000 each
  const res = await hold({ seatIds: [seats[0].id, seats[1].id], ...guest, turnstileToken: "test-pass", discountCode: "rekindle 20" });
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.amountPaise).toBe(240000); // 300000 - 20%
  expect(gateway.orders[0].amountPaise).toBe(240000);
  const [b] = await db.select().from(bookings).where(eq(bookings.id, body.bookingId));
  expect(b).toMatchObject({ subtotalPaise: 300000, discountPaise: 60000, discountCode: "REKINDLE20", amountPaise: 240000 });
});

test("no code leaves the price alone", async () => {
  const { seats } = await seedVenue();
  const h = await createHold({ seatIds: [seats[0].id], ...guest, discountCode: "  " });
  expect(h.amountPaise).toBe(150000);
  const [b] = await db.select().from(bookings).where(eq(bookings.id, h.bookingId));
  expect(b).toMatchObject({ subtotalPaise: 150000, discountPaise: 0, discountCode: null });
});

test("an unknown code is rejected and no seat is held", async () => {
  const { seats } = await seedVenue();
  const res = await hold({ seatIds: [seats[0].id], ...guest, turnstileToken: "test-pass", discountCode: "NOPE50" });
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("INVALID_DISCOUNT");
  expect(await statusOf(seats[0].id)).toBe("available");
  expect(gateway.orders).toHaveLength(0);
});

test.each([
  ["inactive", { active: false }],
  ["expired", { expiresAt: new Date(Date.now() - 1000) }],
])("%s codes are rejected", async (_n, patch) => {
  const { seats } = await seedVenue();
  await db.update(discountCodes).set(patch).where(eq(discountCodes.code, "REKINDLE10"));
  await expect(createHold({ seatIds: [seats[0].id], ...guest, discountCode: "REKINDLE10" })).rejects.toMatchObject({
    code: "INVALID_DISCOUNT",
  });
  expect(await statusOf(seats[0].id)).toBe("available");
});

test("maxUses counts live holds, and frees up once a hold expires", async () => {
  const { seats } = await seedVenue();
  await db.update(discountCodes).set({ maxUses: 1 }).where(eq(discountCodes.code, "REKINDLE10"));
  const now = new Date();
  await createHold({ seatIds: [seats[0].id], ...guestN(1), discountCode: "REKINDLE10" }, now);
  const second = createHold({ seatIds: [seats[1].id], ...guestN(2), discountCode: "REKINDLE10" }, now);
  await expect(second).rejects.toBeInstanceOf(AppError);
  const later = new Date(now.getTime() + 60 * 60_000);
  const h = await createHold({ seatIds: [seats[2].id], ...guestN(3), discountCode: "REKINDLE10" }, later);
  expect(h.amountPaise).toBe(135000);
});

test("POST /api/discount/validate returns the percent for a valid code only", async () => {
  const ok = await validate({ code: "Rekindle 10" });
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({ code: "REKINDLE10", percent: 10 });
  const bad = await validate({ code: "wrong" });
  expect(bad.status).toBe(400);
  expect((await bad.json()).error.code).toBe("INVALID_DISCOUNT");
});
