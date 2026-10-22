import { eq, sql } from "drizzle-orm";
import { beforeEach, expect, test } from "vitest";
import { db } from "@/db/client";
import { adminUsers, bookings, tickets } from "@/db/schema";
import { GET as search } from "@/app/api/scan/search/route";
import { POST as checkin } from "@/app/api/scan/checkin/route";
import { POST as scan } from "@/app/api/scan/route";
import { createSession } from "@/server/auth/session";
import { confirmBooking } from "@/server/payments/confirmBooking";
import { checkInTicketById, scanTicket } from "@/server/scan/scanTicket";
import { createTicketsForBooking, qrPayload } from "@/server/tickets/tokens";
import { guest, holdWithOrder } from "../helpers/holds";
import { seedVenue } from "../helpers/db";

const ORIGIN = "http://localhost:3000";

let adminId: string;
let seatIds: string[];

beforeEach(async () => {
  const [u] = await db
    .insert(adminUsers)
    .values({ email: "gate@example.com", role: "scanner", passwordHash: "x" })
    .returning();
  adminId = u.id;
  const venue = await seedVenue();
  seatIds = venue.seats.map((s) => s.id);
});

/** A paid booking with one ticket per seat; returns the tickets in seat-id order. */
async function paidBooking(ids: string[], who = guest) {
  const b = await holdWithOrder(ids, who);
  await confirmBooking({ orderId: b.orderId, paymentId: `pay_${b.orderId}`, amountPaise: b.amountPaise });
  const rows = await db.select().from(tickets).where(eq(tickets.bookingId, b.bookingId));
  return { ...b, tickets: rows };
}

test("first scan ok with seat, tier and first name", async () => {
  const b = await paidBooking([seatIds[0]]);
  const r = await scanTicket({ token: b.tickets[0].token, adminUserId: adminId, gate: "Gate A" });
  expect(r).toEqual({ result: "ok", seatLabel: "G-A-1", tierName: "Gold", firstName: "Asha" });
  const [t] = await db.select().from(tickets).where(eq(tickets.id, b.tickets[0].id));
  expect(t.checkedInAt).toBeInstanceOf(Date);
  expect(t.checkedInBy).toBe(adminId);
  expect(t.gate).toBe("Gate A");
});

test("second scan is already, with time and gate of the first", async () => {
  const b = await paidBooking([seatIds[0]]);
  await scanTicket({ token: b.tickets[0].token, adminUserId: adminId, gate: "Gate A" });
  const r = await scanTicket({ token: b.tickets[0].token, adminUserId: adminId, gate: "Gate B" });
  expect(r.result).toBe("already");
  if (r.result !== "already") throw new Error("unreachable");
  expect(r.gate).toBe("Gate A");
  expect(r.checkedInAt).toBeInstanceOf(Date);
  expect(Math.abs(Date.now() - r.checkedInAt.getTime())).toBeLessThan(60_000);
});

test("10 parallel scans: exactly one ok", async () => {
  const b = await paidBooking([seatIds[0]]);
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) => scanTicket({ token: b.tickets[0].token, adminUserId: adminId, gate: `G${i}` })),
  );
  expect(results.filter((r) => r.result === "ok")).toHaveLength(1);
  expect(results.filter((r) => r.result === "already")).toHaveLength(9);
});

test("unknown token is invalid", async () => {
  expect(await scanTicket({ token: "A".repeat(43), adminUserId: adminId, gate: "G" })).toEqual({ result: "invalid" });
});

test.each(["refund_due", "refunded", "expired", "pending"] as const)(
  "ticket of %s booking is invalid and not checked in",
  async (status) => {
    const b = await paidBooking([seatIds[0]]);
    await db.update(bookings).set({ status }).where(eq(bookings.id, b.bookingId));
    expect(await scanTicket({ token: b.tickets[0].token, adminUserId: adminId, gate: "G" })).toEqual({ result: "invalid" });
    const [t] = await db.select().from(tickets).where(eq(tickets.id, b.tickets[0].id));
    expect(t.checkedInAt).toBeNull();
  },
);

test("already-checked-in ticket whose booking was later refunded is invalid, not already", async () => {
  const b = await paidBooking([seatIds[0]]);
  await scanTicket({ token: b.tickets[0].token, adminUserId: adminId, gate: "G" });
  await db.update(bookings).set({ status: "refunded" }).where(eq(bookings.id, b.bookingId));
  expect(await scanTicket({ token: b.tickets[0].token, adminUserId: adminId, gate: "G" })).toEqual({ result: "invalid" });
});

test("comp booking ticket is ok", async () => {
  const b = await holdWithOrder([seatIds[0]]);
  await db.update(bookings).set({ status: "comp" }).where(eq(bookings.id, b.bookingId));
  await db.transaction((tx) => createTicketsForBooking(tx, b.bookingId));
  const [t] = await db.select().from(tickets).where(eq(tickets.bookingId, b.bookingId));
  expect(await scanTicket({ token: t.token, adminUserId: adminId, gate: "G" })).toMatchObject({ result: "ok", firstName: "Asha" });
});

test("manual check-in twice: ok then already; unknown id invalid", async () => {
  const b = await paidBooking([seatIds[0]]);
  expect(await checkInTicketById(b.tickets[0].id, adminId, "Desk")).toMatchObject({ result: "ok", seatLabel: "G-A-1" });
  expect(await checkInTicketById(b.tickets[0].id, adminId, "Desk")).toMatchObject({ result: "already", gate: "Desk" });
  expect(await checkInTicketById("00000000-0000-4000-8000-000000000000", adminId, "Desk")).toEqual({ result: "invalid" });
});

async function sessionCookie(role: "admin" | "scanner" = "scanner") {
  let id = adminId;
  if (role === "admin") {
    const [u] = await db.insert(adminUsers).values({ email: "boss@example.com", role, passwordHash: "x" }).returning();
    id = u.id;
  }
  return `admin_session=${await createSession(id)}`;
}

function post(path: string, body: unknown, cookie?: string, origin: string | null = ORIGIN) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

test("POST /api/scan: scanner role scans a real payload", async () => {
  const b = await paidBooking([seatIds[0]]);
  const res = await scan(post("/api/scan", { payload: qrPayload(b.tickets[0].token), gate: " Gate A " }, await sessionCookie()));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ result: "ok", seatLabel: "G-A-1", tierName: "Gold", firstName: "Asha" });
  const again = await scan(post("/api/scan", { payload: qrPayload(b.tickets[0].token), gate: "Gate A" }, await sessionCookie()));
  const body = await again.json();
  expect(body).toMatchObject({ result: "already", gate: "Gate A" });
  expect(typeof body.checkedInAt).toBe("string");
});

test("POST /api/scan: payload without RKT1 prefix is invalid (200)", async () => {
  const b = await paidBooking([seatIds[0]]);
  const res = await scan(post("/api/scan", { payload: b.tickets[0].token, gate: "G" }, await sessionCookie()));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ result: "invalid" });
  const [t] = await db.select().from(tickets).where(eq(tickets.id, b.tickets[0].id));
  expect(t.checkedInAt).toBeNull();
});

test("POST /api/scan: unauthenticated 401, missing Origin 403, bad body 400", async () => {
  expect((await scan(post("/api/scan", { payload: "x", gate: "G" }))).status).toBe(401);
  expect((await scan(post("/api/scan", { payload: "x", gate: "G" }, await sessionCookie(), null))).status).toBe(403);
  expect((await scan(post("/api/scan", { payload: "x", gate: "   " }, await sessionCookie()))).status).toBe(400);
});

test("POST /api/scan: 121st scan in a minute is rate limited", async () => {
  const cookie = await sessionCookie();
  await db.execute(sql`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${`scan:user:${adminId}`}, to_timestamp(floor(extract(epoch from now()) / 60) * 60), 120)`);
  const res = await scan(post("/api/scan", { payload: "x", gate: "G" }, cookie));
  expect(res.status).toBe(429);
});

test("search by booking code and by phone in another format", async () => {
  const b = await paidBooking([seatIds[0], seatIds[1]]);
  await paidBooking([seatIds[2]], { name: "Other Person", email: "o@example.com", phone: "+919811111111" });
  const cookie = await sessionCookie();
  const get = (q: string) =>
    search(new Request(`${ORIGIN}/api/scan/search?q=${encodeURIComponent(q)}`, { headers: { cookie } }));

  const [bk] = await db.select().from(bookings).where(eq(bookings.id, b.bookingId));
  const byCode = await get(bk.publicCode.toLowerCase());
  expect(byCode.status).toBe(200);
  const { tickets: found } = await byCode.json();
  expect(found).toHaveLength(2);
  expect(found[0]).toMatchObject({
    seatLabel: "G-A-1", tierName: "Gold", bookingCode: bk.publicCode, guestName: "Asha Rao",
    bookingStatus: "paid", checkedInAt: null, gate: null,
  });
  expect(found[0].ticketId).toBeTruthy();

  const byPhone = await (await get("098765 43210")).json();
  expect(byPhone.tickets.map((t: { seatLabel: string }) => t.seatLabel)).toEqual(["G-A-1", "G-A-2"]);

  expect((await get("a")).status).toBe(400);
  expect((await (await get("zzzzzzzz")).json()).tickets).toEqual([]);
  expect((await search(new Request(`${ORIGIN}/api/scan/search?q=abcd`))).status).toBe(401);
});

test("POST /api/scan/checkin checks in by ticket id, then reports already", async () => {
  const b = await paidBooking([seatIds[0]]);
  const cookie = await sessionCookie();
  const r1 = await checkin(post("/api/scan/checkin", { ticketId: b.tickets[0].id, gate: "Desk" }, cookie));
  expect(await r1.json()).toMatchObject({ result: "ok" });
  const r2 = await checkin(post("/api/scan/checkin", { ticketId: b.tickets[0].id, gate: "Desk" }, cookie));
  expect(await r2.json()).toMatchObject({ result: "already", gate: "Desk" });
  expect((await checkin(post("/api/scan/checkin", { ticketId: "nope", gate: "Desk" }, cookie))).status).toBe(400);
});
