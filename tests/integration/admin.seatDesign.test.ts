import { eq } from "drizzle-orm";
import { beforeEach, expect, test } from "vitest";
import { db } from "@/db/client";
import { adminUsers, seats } from "@/db/schema";
import type { Seat, Tier } from "@/db/schema";
import { POST as designRoute } from "@/app/api/admin/seats/design/route";
import { createSession } from "@/server/auth/session";
import { createHold } from "@/server/holds/createHold";
import { guest, guestN, holdWithOrder, statusOf } from "../helpers/holds";
import { confirmBooking } from "@/server/payments/confirmBooking";
import { seedVenue } from "../helpers/db";

const ORIGIN = "http://localhost:3000";

let adminId: string;
let gold: Seat[];
let goldTier: Tier;

beforeEach(async () => {
  const [u] = await db.insert(adminUsers).values({ email: "boss@example.com", role: "admin", passwordHash: "x" }).returning();
  adminId = u.id;
  const v = await seedVenue();
  [goldTier] = v.tiers;
  gold = v.seats.filter((s) => s.tierId === goldTier.id);
});

function post(cookie: string | null, rows: unknown) {
  const headers: Record<string, string> = { origin: ORIGIN, "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return designRoute(new Request(`${ORIGIN}/api/admin/seats/design`, { method: "POST", headers, body: JSON.stringify({ rows }) }));
}

test("requires an admin session", async () => {
  expect((await post(null, [{ section: "G", row: "A", number: 1, x: 0, y: 0, tier: "Gold" }])).status).toBe(401);
});

test("moves an available seat and changes its tier", async () => {
  const cookie = `admin_session=${await createSession(adminId)}`;
  const s = gold[0];
  const res = await post(cookie, [{ section: s.section, row: s.row, number: s.number, x: 999, y: 888, tier: "Silver" }]);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ inserted: 0 });
  const [updated] = await db.select().from(seats).where(eq(seats.id, s.id));
  expect(updated).toMatchObject({ x: 999, y: 888 });
  expect(updated.tierId).not.toBe(goldTier.id);
});

test("adds a brand-new seat under a fresh label", async () => {
  const cookie = `admin_session=${await createSession(adminId)}`;
  const res = await post(cookie, [{ section: "Z", row: "Z", number: 1, x: 10, y: 10, tier: "Gold" }]);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ inserted: 1 });
  const [created] = await db.select().from(seats).where(eq(seats.label, "Z-Z-1"));
  expect(created).toMatchObject({ section: "Z", row: "Z", number: 1, x: 10, y: 10, tierId: goldTier.id });
});

test("never moves a seat that is held or sold", async () => {
  const cookie = `admin_session=${await createSession(adminId)}`;
  await createHold({ seatIds: [gold[0].id], ...guest });
  const b = await holdWithOrder([gold[1].id], guestN(2));
  await confirmBooking({ orderId: b.orderId, paymentId: "pay_1", amountPaise: b.amountPaise });

  await post(cookie, [
    { section: gold[0].section, row: gold[0].row, number: gold[0].number, x: 1, y: 1, tier: "Gold" },
    { section: gold[1].section, row: gold[1].row, number: gold[1].number, x: 2, y: 2, tier: "Gold" },
  ]);
  expect(await statusOf(gold[0].id)).toBe("held");
  expect(await statusOf(gold[1].id)).toBe("sold");
  const [held] = await db.select().from(seats).where(eq(seats.id, gold[0].id));
  const [sold] = await db.select().from(seats).where(eq(seats.id, gold[1].id));
  expect(held).not.toMatchObject({ x: 1, y: 1 });
  expect(sold).not.toMatchObject({ x: 2, y: 2 });
});

test("rejects an unknown tier name and an empty batch", async () => {
  const cookie = `admin_session=${await createSession(adminId)}`;
  const bad = await post(cookie, [{ section: "Z", row: "Z", number: 1, x: 0, y: 0, tier: "Platinum" }]);
  expect(bad.status).toBe(400);
  const empty = await post(cookie, []);
  expect(empty.status).toBe(400);
});
