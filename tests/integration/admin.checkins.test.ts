import { eq } from "drizzle-orm";
import { beforeEach, expect, test } from "vitest";
import { db } from "@/db/client";
import { adminUsers, tickets } from "@/db/schema";
import { GET as checkinsRoute } from "@/app/api/admin/checkins/route";
import { createSession } from "@/server/auth/session";
import { getCheckinDashboard } from "@/server/admin/checkins";
import { checkInTicketById } from "@/server/scan/scanTicket";
import { confirmBooking } from "@/server/payments/confirmBooking";
import { guest, guestN, holdWithOrder } from "../helpers/holds";
import { seedVenue } from "../helpers/db";

const ORIGIN = "http://localhost:3000";

let adminId: string;

beforeEach(async () => {
  const [u] = await db.insert(adminUsers).values({ email: "boss@example.com", role: "admin", passwordHash: "x" }).returning();
  adminId = u.id;
});

async function cookieFor(role: "admin" | "scanner") {
  if (role === "admin") return `admin_session=${await createSession(adminId)}`;
  const [u] = await db.insert(adminUsers).values({ email: "gate@example.com", role, passwordHash: "x" }).returning();
  return `admin_session=${await createSession(u.id)}`;
}

function get(cookie?: string, etag?: string) {
  const headers: Record<string, string> = { origin: ORIGIN };
  if (cookie) headers.cookie = cookie;
  if (etag) headers["if-none-match"] = etag;
  return checkinsRoute(new Request(`${ORIGIN}/api/admin/checkins`, { headers }));
}

test("getCheckinDashboard totals, gate and tier breakdowns, recent list", async () => {
  const { seats } = await seedVenue({ seatsPerTier: 2 });
  const b1 = await holdWithOrder([seats[0].id], guest);
  await confirmBooking({ orderId: b1.orderId, paymentId: `pay_${b1.orderId}`, amountPaise: b1.amountPaise });
  const b2 = await holdWithOrder([seats[2].id], guestN(2));
  await confirmBooking({ orderId: b2.orderId, paymentId: `pay_${b2.orderId}`, amountPaise: b2.amountPaise });

  const before = await getCheckinDashboard();
  expect(before.totals).toEqual({ totalValid: 2, checkedIn: 0 });

  const [t1] = await db.select().from(tickets).where(eq(tickets.bookingId, b1.bookingId));
  await checkInTicketById(t1.id, adminId, "Main gate");

  const after = await getCheckinDashboard();
  expect(after.totals).toEqual({ totalValid: 2, checkedIn: 1 });
  expect(after.byGate).toEqual([{ gate: "Main gate", count: 1 }]);
  expect(after.recent).toHaveLength(1);
  expect(after.recent[0]).toMatchObject({ ticketId: t1.id, gate: "Main gate", guestName: guest.name });
  const tierRow = after.byTier.find((t) => t.total > 0 || t.checkedIn > 0);
  expect(tierRow?.checkedIn).toBeGreaterThanOrEqual(1);
});

test("GET /api/admin/checkins requires an admin session, not scanner", async () => {
  expect((await get()).status).toBe(401);
  expect((await get(await cookieFor("scanner"))).status).toBe(403);
  expect((await get(await cookieFor("admin"))).status).toBe(200);
});

test("GET /api/admin/checkins sends a 304 on a matching ETag", async () => {
  const cookie = await cookieFor("admin");
  const res1 = await get(cookie);
  expect(res1.status).toBe(200);
  const etag = res1.headers.get("etag");
  expect(etag).toBeTruthy();
  const res2 = await get(cookie, etag!);
  expect(res2.status).toBe(304);
});
