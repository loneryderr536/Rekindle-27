import { eq } from "drizzle-orm";
import { beforeEach, expect, test } from "vitest";
import { db } from "@/db/client";
import { tickets } from "@/db/schema";
import { GET as qrRoute } from "@/app/api/tickets/qr/[token]/route";
import { confirmBooking } from "@/server/payments/confirmBooking";
import { guest, holdWithOrder } from "../helpers/holds";
import { seedVenue } from "../helpers/db";

const ORIGIN = "http://localhost:3000";
let seatIds: string[];

beforeEach(async () => {
  seatIds = (await seedVenue({ seatsPerTier: 1 })).seats.map((s) => s.id);
});

const isPng = (buf: Buffer) => buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

function get(token: string) {
  return qrRoute(new Request(`${ORIGIN}/api/tickets/qr/${token}`), { params: Promise.resolve({ token }) });
}

test("404 for an unknown ticket token", async () => {
  const res = await get("not-a-real-token");
  expect(res.status).toBe(404);
});

test("serves a cacheable navy-on-cream PNG for a paid ticket's token", async () => {
  const b = await holdWithOrder([seatIds[0]], guest);
  await confirmBooking({ orderId: b.orderId, paymentId: `pay_${b.orderId}`, amountPaise: b.amountPaise });
  const [t] = await db.select().from(tickets).where(eq(tickets.bookingId, b.bookingId));

  const res = await get(t.token);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("image/png");
  expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  expect(isPng(Buffer.from(await res.arrayBuffer()))).toBe(true);
});
