import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test } from "vitest";
import { db } from "@/db/client";
import { bookings } from "@/db/schema";
import { GET as getSeats } from "@/app/api/seats/route";
import { POST as postHold } from "@/app/api/holds/route";
import { resetEnvForTests } from "@/lib/env";
import { setGatewayForTests } from "@/server/payments/gateway";
import { FakeGateway } from "../helpers/fakes";
import { seedVenue } from "../helpers/db";
import { guest, guestN, statusOf } from "../helpers/holds";

let gateway: FakeGateway;

beforeEach(() => {
  gateway = new FakeGateway();
  setGatewayForTests(gateway);
});
afterEach(() => setGatewayForTests(null));

function hold(body: unknown, headers: Record<string, string> = {}, raw?: string) {
  return postHold(
    new Request("http://localhost/api/holds", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4", ...headers },
      body: raw ?? JSON.stringify(body),
    }),
  );
}

const valid = (seatIds: string[], extra: object = {}) => ({
  seatIds, ...guest, turnstileToken: "test-pass", ...extra,
});

test("GET /api/seats returns seats and tiers, no-store", async () => {
  await seedVenue({ seatsPerTier: 2 });
  const res = await getSeats();
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("no-store");
  const body = await res.json();
  expect(body.seats).toHaveLength(4);
  expect(body.tiers).toHaveLength(2);
});

test("POST /api/holds creates hold and order, stores razorpay_order_id", async () => {
  const { seats } = await seedVenue();
  const res = await hold(valid([seats[0].id, seats[1].id]));
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body).toMatchObject({
    amountPaise: 300000,
    razorpayOrderId: "order_test_1",
    razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
  });
  expect(typeof body.accessToken).toBe("string");
  expect(new Date(body.holdExpiresAt).getTime()).toBeGreaterThan(Date.now());
  expect(gateway.orders).toEqual([
    { id: "order_test_1", amountPaise: 300000, receipt: body.bookingId, notes: { booking_id: body.bookingId } },
  ]);
  const [b] = await db.select().from(bookings).where(eq(bookings.id, body.bookingId));
  expect(b.razorpayOrderId).toBe("order_test_1");
  expect(b.clientIp).toBe("1.2.3.4");
  expect(await statusOf(seats[0].id)).toBe("held");
});

test("POST /api/holds ignores any amount sent by the browser", async () => {
  const { seats } = await seedVenue();
  const res = await hold(valid([seats[0].id], { amountPaise: 1 }));
  expect(res.status).toBe(201);
  expect((await res.json()).amountPaise).toBe(150000);
});

test("POST /api/holds with bad turnstile → 403 TURNSTILE_FAILED, no hold", async () => {
  const { seats } = await seedVenue();
  const res = await hold(valid([seats[0].id], { turnstileToken: "nope" }));
  expect(res.status).toBe(403);
  expect((await res.json()).error.code).toBe("TURNSTILE_FAILED");
  expect(await statusOf(seats[0].id)).toBe("available");
  expect(gateway.orders).toHaveLength(0);
});

test("POST /api/holds 7 seats → 400 VALIDATION", async () => {
  const { seats } = await seedVenue();
  const res = await hold(valid(seats.slice(0, 7).map((s) => s.id)));
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("VALIDATION");
});

test("POST /api/holds malformed JSON → 400 VALIDATION", async () => {
  const res = await hold(null, {}, "{not json");
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("VALIDATION");
});

test("gateway error → 502 and seats back to available", async () => {
  const { seats } = await seedVenue();
  gateway.failNextCreateOrder();
  const res = await hold(valid([seats[0].id]));
  expect(res.status).toBe(502);
  expect((await res.json()).error.code).toBe("PAYMENT_UNAVAILABLE");
  expect(await statusOf(seats[0].id)).toBe("available");
  const [b] = await db.select().from(bookings);
  expect(b.status).toBe("expired");
  // the guest can immediately try again
  expect((await hold(valid([seats[0].id]))).status).toBe(201);
});

test("seat already taken → 409 SEATS_TAKEN", async () => {
  const { seats } = await seedVenue();
  expect((await hold(valid([seats[0].id]), { "x-forwarded-for": "9.9.9.1" })).status).toBe(201);
  const res = await hold(valid([seats[0].id], { ...guestN(2) }), { "x-forwarded-for": "9.9.9.2" });
  expect(res.status).toBe(409);
  expect((await res.json()).error.code).toBe("SEATS_TAKEN");
});

test("11th request from same IP → 429 with Retry-After", async () => {
  await seedVenue();
  for (let i = 0; i < 10; i++) {
    const res = await hold(valid([]), { "x-forwarded-for": "5.5.5.5, 10.0.0.1" });
    expect(res.status).toBe(400);
  }
  const res = await hold(valid([]), { "x-forwarded-for": "5.5.5.5, 10.0.0.2" });
  expect(res.status).toBe(429);
  expect((await res.json()).error.code).toBe("RATE_LIMITED");
  expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  // a different IP is unaffected
  expect((await hold(valid([]), { "x-forwarded-for": "6.6.6.6" })).status).toBe(400);
});

test("load-test flag (with ALLOW_TEST_MODES) lifts the per-IP hold limit and active-hold check", async () => {
  const { seats } = await seedVenue();
  const prev = { f: process.env.LOAD_TEST_DISABLE_RATE_LIMIT, a: process.env.ALLOW_TEST_MODES };
  Object.assign(process.env, { LOAD_TEST_DISABLE_RATE_LIMIT: "1", ALLOW_TEST_MODES: "1" });
  resetEnvForTests();
  try {
    const sameIp = { "x-forwarded-for": "7.7.7.7" };
    for (let i = 0; i < 12; i++) {
      const res = await hold(valid([seats[i].id], { ...guestN(i + 1) }), sameIp);
      expect(res.status).toBe(201);
    }
  } finally {
    for (const [k, v] of [["LOAD_TEST_DISABLE_RATE_LIMIT", prev.f], ["ALLOW_TEST_MODES", prev.a]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetEnvForTests();
  }
});
