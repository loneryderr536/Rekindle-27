import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test } from "vitest";
import { db } from "@/db/client";
import { adminUsers, auditLog, bookingItems, bookings, emailOutbox, seats, tickets, tiers } from "@/db/schema";
import { POST as compRoute } from "@/app/api/admin/comp/route";
import { POST as seatsRoute } from "@/app/api/admin/seats/route";
import { PATCH as tiersPatch, POST as tiersPost } from "@/app/api/admin/tiers/route";
import { assertSeatsExist, blockSeats, issueComp, unblockSeats } from "@/server/admin/seats";
import { assignSeatsToTier, createTier, updateTier } from "@/server/admin/tiers";
import { createSession } from "@/server/auth/session";
import { setEmailSenderForTests } from "@/server/email/sender";
import { settleKickedOutbox } from "@/server/email/kickOutbox";
import { createHold } from "@/server/holds/createHold";
import { confirmBooking } from "@/server/payments/confirmBooking";
import { scanTicket } from "@/server/scan/scanTicket";
import { FakeEmailSender } from "../helpers/fakes";
import { guest, guestN, holdWithOrder, statusOf } from "../helpers/holds";
import { seedVenue } from "../helpers/db";
import type { Seat, Tier } from "@/db/schema";

const ORIGIN = "http://localhost:3000";
const comp = { name: "VIP Guest", email: "VIP@Example.com", phone: "98765 43210" };

let adminId: string;
let gold: Seat[];
let silver: Seat[];
let goldTier: Tier;
let silverTier: Tier;

beforeEach(async () => {
  setEmailSenderForTests(new FakeEmailSender());
  const [u] = await db.insert(adminUsers).values({ email: "boss@example.com", role: "admin", passwordHash: "x" }).returning();
  adminId = u.id;
  const v = await seedVenue();
  [goldTier, silverTier] = v.tiers;
  gold = v.seats.filter((s) => s.tierId === goldTier.id);
  silver = v.seats.filter((s) => s.tierId === silverTier.id);
});

afterEach(async () => {
  await settleKickedOutbox();
  setEmailSenderForTests(null);
});

const audits = async () => db.select().from(auditLog);
const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    const err = e as { code?: string; status?: number; details?: { seatIds?: string[] } };
    return { code: err.code, status: err.status, seatIds: err.details?.seatIds };
  }
  throw new Error("expected rejection");
};

test("block available seat; held seat skipped", async () => {
  await createHold({ seatIds: [gold[1].id], ...guest });
  const r = await blockSeats([gold[0].id, gold[1].id], adminId);
  expect(r).toEqual({ blocked: [gold[0].id], skipped: [gold[1].id] });
  expect(await statusOf(gold[0].id)).toBe("blocked");
  expect(await statusOf(gold[1].id)).toBe("held");
});

test("unblock only blocked seats", async () => {
  await blockSeats([gold[0].id], adminId);
  const r = await unblockSeats([gold[0].id, gold[1].id], adminId);
  expect(r).toEqual({ unblocked: [gold[0].id], skipped: [gold[1].id] });
  expect(await statusOf(gold[0].id)).toBe("available");
});

test("blocked seat cannot be held publicly", async () => {
  await blockSeats([gold[0].id], adminId);
  expect(await code(createHold({ seatIds: [gold[0].id], ...guest }))).toMatchObject({ code: "SEATS_TAKEN", status: 409 });
});

test("unknown seat id -> INVALID_SEATS and no change", async () => {
  const unknown = "00000000-0000-4000-8000-000000000000";
  expect(await code(blockSeats([gold[0].id, unknown], adminId))).toMatchObject({ code: "INVALID_SEATS", status: 400 });
  expect(await statusOf(gold[0].id)).toBe("available");
  expect(() => assertSeatsExist([unknown], [])).toThrow();
});

test("comp on blocked seats creates comp booking with tickets, items at price 0, outbox", async () => {
  await blockSeats([gold[0].id, gold[1].id], adminId);
  const r = await issueComp({ seatIds: [gold[0].id, gold[1].id], ...comp }, adminId);
  const [b] = await db.select().from(bookings).where(eq(bookings.id, r.bookingId));
  expect(b).toMatchObject({
    status: "comp", amountPaise: 0, seatCount: 2, email: "vip@example.com", phone: "+919876543210",
    publicCode: r.publicCode, accessToken: r.accessToken,
  });
  expect(await statusOf(gold[0].id)).toBe("sold");
  const items = await db.select().from(bookingItems).where(eq(bookingItems.bookingId, r.bookingId));
  expect(items.map((i) => [i.tierName, i.pricePaise])).toEqual([["Gold", 0], ["Gold", 0]]);
  expect(await db.select().from(tickets).where(eq(tickets.bookingId, r.bookingId))).toHaveLength(2);
  const outbox = await db.select().from(emailOutbox).where(eq(emailOutbox.bookingId, r.bookingId));
  expect(outbox).toMatchObject([{ kind: "tickets", status: "pending" }]);
});

test("comp ticket scans ok at the gate", async () => {
  const r = await issueComp({ seatIds: [silver[0].id], ...comp }, adminId);
  const [t] = await db.select().from(tickets).where(eq(tickets.bookingId, r.bookingId));
  expect(await scanTicket({ token: t.token, adminUserId: adminId, gate: "A" })).toMatchObject({
    result: "ok", tierName: "Silver", firstName: "VIP",
  });
});

test("comp is all-or-nothing when one seat is sold", async () => {
  const b = await holdWithOrder([gold[1].id]);
  await confirmBooking({ orderId: b.orderId, paymentId: "pay_1", amountPaise: b.amountPaise });
  const res = await code(issueComp({ seatIds: [gold[0].id, gold[1].id], ...comp }, adminId));
  expect(res).toMatchObject({ code: "SEATS_TAKEN", status: 409, seatIds: [gold[1].id] });
  expect(await statusOf(gold[0].id)).toBe("available");
  expect(await db.select().from(bookings).where(eq(bookings.status, "comp"))).toHaveLength(0);
  expect(await db.select().from(tickets)).toHaveLength(1);
  expect((await audits()).filter((a) => a.action === "issue_comp")).toHaveLength(0);
});

test("comp on a live held seat -> SEATS_TAKEN", async () => {
  await createHold({ seatIds: [gold[0].id], ...guest });
  expect(await code(issueComp({ seatIds: [gold[0].id], ...comp }, adminId))).toMatchObject({ code: "SEATS_TAKEN" });
  expect(await statusOf(gold[0].id)).toBe("held");
});

test("comp takes an expired held seat; the late payment becomes refund_due", async () => {
  const past = new Date(Date.now() - 3600_000);
  const b = await holdWithOrder([gold[0].id], guest, past);
  const r = await issueComp({ seatIds: [gold[0].id], ...comp }, adminId);
  expect(await statusOf(gold[0].id)).toBe("sold");
  expect(await confirmBooking({ orderId: b.orderId, paymentId: "pay_late", amountPaise: b.amountPaise })).toBe("refund_due");
  const [seat] = await db.select().from(seats).where(eq(seats.id, gold[0].id));
  expect(seat).toMatchObject({ status: "sold", bookingId: r.bookingId });
});

test("comp validation: bad phone, bad email, short name, duplicates", async () => {
  const ids = [gold[0].id];
  expect(await code(issueComp({ seatIds: ids, ...comp, phone: "123" }, adminId))).toMatchObject({ code: "INVALID_PHONE", status: 400 });
  await expect(issueComp({ seatIds: ids, ...comp, email: "nope" }, adminId)).rejects.toThrow();
  await expect(issueComp({ seatIds: ids, ...comp, name: "A" }, adminId)).rejects.toThrow();
  await expect(issueComp({ seatIds: [gold[0].id, gold[0].id], ...comp }, adminId)).rejects.toThrow();
  expect(await statusOf(gold[0].id)).toBe("available");
});

test("assign tier moves available and blocked seats", async () => {
  await blockSeats([gold[1].id], adminId);
  await assignSeatsToTier([gold[0].id, gold[1].id], silverTier.id, adminId);
  const rows = await db.select().from(seats).where(eq(seats.tierId, silverTier.id));
  expect(rows).toHaveLength(12);
  expect(await statusOf(gold[1].id)).toBe("blocked");
});

test("assign tier rejects held seat", async () => {
  await createHold({ seatIds: [gold[1].id], ...guest });
  const res = await code(assignSeatsToTier([gold[0].id, gold[1].id], silverTier.id, adminId));
  expect(res).toMatchObject({ code: "SEATS_LOCKED", status: 409, seatIds: [gold[1].id] });
});

test("assign tier with a sold seat -> SEATS_LOCKED and no seats changed", async () => {
  await issueComp({ seatIds: [gold[1].id], ...comp }, adminId);
  expect(await code(assignSeatsToTier([gold[0].id, gold[1].id], silverTier.id, adminId))).toMatchObject({ code: "SEATS_LOCKED" });
  const [s] = await db.select().from(seats).where(eq(seats.id, gold[0].id));
  expect(s.tierId).toBe(goldTier.id);
});

test("assign tier: unknown tier -> 404", async () => {
  expect(await code(assignSeatsToTier([gold[0].id], "00000000-0000-4000-8000-000000000000", adminId)))
    .toMatchObject({ code: "TIER_NOT_FOUND", status: 404 });
});

test("createTier appends sort order; duplicate name 409", async () => {
  const t = await createTier({ name: "  Bronze ", pricePaise: 50000, color: "#aabbcc" }, adminId);
  expect(t).toMatchObject({ name: "Bronze", sortOrder: 2 });
  expect(await code(createTier({ name: "Gold", pricePaise: 100, color: "#aabbcc" }, adminId))).toMatchObject({ code: "TIER_NAME_TAKEN", status: 409 });
});

test("updateTier: duplicate name 409, unknown id 404, price < 100 rejected", async () => {
  expect(await code(updateTier(goldTier.id, { name: "Silver" }, adminId))).toMatchObject({ code: "TIER_NAME_TAKEN", status: 409 });
  expect(await code(updateTier("00000000-0000-4000-8000-000000000000", { name: "X" }, adminId))).toMatchObject({ code: "TIER_NOT_FOUND", status: 404 });
  await expect(updateTier(goldTier.id, { pricePaise: 99 }, adminId)).rejects.toThrow();
  await expect(updateTier(goldTier.id, { color: "red" }, adminId)).rejects.toThrow();
  await expect(updateTier(goldTier.id, { pricePaise: 100.5 }, adminId)).rejects.toThrow();
  const [t] = await db.select().from(tiers).where(eq(tiers.id, goldTier.id));
  expect(t.pricePaise).toBe(150000);
});

// Review Focus #4
test("price change during checkout does not change that booking's amount", async () => {
  const b = await holdWithOrder([gold[0].id]);
  expect(b.amountPaise).toBe(150000);
  await updateTier(goldTier.id, { pricePaise: 200000 }, adminId);
  expect(await confirmBooking({ orderId: b.orderId, paymentId: "pay_x", amountPaise: 150000 })).toBe("confirmed");
  const [row] = await db.select().from(bookings).where(eq(bookings.id, b.bookingId));
  expect(row.amountPaise).toBe(150000);
  const b2 = await holdWithOrder([gold[1].id], guestN(2));
  expect(b2.amountPaise).toBe(200000);
});

test("every mutation writes an audit entry", async () => {
  await blockSeats([gold[0].id], adminId);
  await unblockSeats([gold[0].id], adminId);
  await issueComp({ seatIds: [gold[1].id], ...comp }, adminId);
  const t = await createTier({ name: "Bronze", pricePaise: 50000, color: "#aabbcc" }, adminId);
  await updateTier(t.id, { pricePaise: 60000 }, adminId);
  await assignSeatsToTier([gold[2].id], t.id, adminId);
  const rows = await audits();
  expect(rows.map((a) => a.action).sort()).toEqual(
    ["assign_tier", "block_seats", "create_tier", "issue_comp", "unblock_seats", "update_tier"],
  );
  expect(rows.every((a) => a.adminUserId === adminId)).toBe(true);
  const upd = rows.find((a) => a.action === "update_tier")!;
  expect(upd.details).toMatchObject({ old: { pricePaise: 50000 }, new: { pricePaise: 60000 } });
  expect(rows.find((a) => a.action === "block_seats")!.details).toEqual({ changed: [gold[0].id], skipped: [] });
});

// Routes
async function cookieFor(role: "admin" | "scanner") {
  if (role === "admin") return `admin_session=${await createSession(adminId)}`;
  const [u] = await db.insert(adminUsers).values({ email: "gate@example.com", role, passwordHash: "x" }).returning();
  return `admin_session=${await createSession(u.id)}`;
}
function req(method: string, path: string, body: unknown, cookie?: string, origin: string | null = ORIGIN) {
  return new Request(`${ORIGIN}${path}`, {
    method, body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...(origin ? { origin } : {}), ...(cookie ? { cookie } : {}) },
  });
}

test("POST /api/admin/seats: block, unblock, assignTier, validation", async () => {
  const admin = await cookieFor("admin");
  let res = await seatsRoute(req("POST", "/api/admin/seats", { action: "block", seatIds: [gold[0].id] }, admin));
  expect(await res.json()).toEqual({ blocked: [gold[0].id], skipped: [] });
  res = await seatsRoute(req("POST", "/api/admin/seats", { action: "unblock", seatIds: [gold[0].id] }, admin));
  expect(await res.json()).toEqual({ unblocked: [gold[0].id], skipped: [] });
  res = await seatsRoute(req("POST", "/api/admin/seats", { action: "assignTier", seatIds: [gold[0].id], tierId: silverTier.id }, admin));
  expect(res.status).toBe(200);
  res = await seatsRoute(req("POST", "/api/admin/seats", { action: "assignTier", seatIds: [gold[0].id] }, admin));
  expect(res.status).toBe(400);
  res = await seatsRoute(req("POST", "/api/admin/seats", { action: "nuke", seatIds: [] }, admin));
  expect(res.status).toBe(400);
});

test("POST /api/admin/comp: issues comp and queues email; SEATS_TAKEN 409", async () => {
  const admin = await cookieFor("admin");
  const res = await compRoute(req("POST", "/api/admin/comp", { seatIds: [gold[0].id], ...comp }, admin));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ bookingId: expect.any(String), publicCode: expect.any(String) });
  const again = await compRoute(req("POST", "/api/admin/comp", { seatIds: [gold[0].id], ...comp }, admin));
  expect(again.status).toBe(409);
  expect((await again.json()).error.code).toBe("SEATS_TAKEN");
});

test("POST/PATCH /api/admin/tiers", async () => {
  const admin = await cookieFor("admin");
  const created = await tiersPost(req("POST", "/api/admin/tiers", { name: "Bronze", pricePaise: 50000, color: "#aabbcc" }, admin));
  expect(created.status).toBe(201);
  const { id } = await created.json();
  const patched = await tiersPatch(req("PATCH", "/api/admin/tiers", { id, pricePaise: 70000 }, admin));
  expect(await patched.json()).toMatchObject({ id, pricePaise: 70000 });
  expect((await tiersPatch(req("PATCH", "/api/admin/tiers", { id, pricePaise: 5 }, admin))).status).toBe(400);
  expect((await tiersPatch(req("PATCH", "/api/admin/tiers", { id }, admin))).status).toBe(400);
  expect((await tiersPatch(req("PATCH", "/api/admin/tiers", { id, name: "Gold" }, admin))).status).toBe(409);
});

test("routes: scanner 403, anonymous 401, no Origin 403", async () => {
  const scanner = await cookieFor("scanner");
  const admin = await cookieFor("admin");
  const cases: [(r: Request) => Promise<Response>, string, string, unknown][] = [
    [seatsRoute, "POST", "/api/admin/seats", { action: "block", seatIds: [gold[0].id] }],
    [compRoute, "POST", "/api/admin/comp", { seatIds: [gold[0].id], ...comp }],
    [tiersPost, "POST", "/api/admin/tiers", { name: "B", pricePaise: 500, color: "#aabbcc" }],
    [tiersPatch, "PATCH", "/api/admin/tiers", { id: goldTier.id, name: "Z" }],
  ];
  for (const [route, method, path, body] of cases) {
    expect((await route(req(method, path, body, scanner))).status).toBe(403);
    expect((await route(req(method, path, body))).status).toBe(401);
    expect((await route(req(method, path, body, admin, null))).status).toBe(403);
  }
  expect(await statusOf(gold[0].id)).toBe("available");
  expect(await audits()).toHaveLength(0);
});
