import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test } from "vitest";
import { db } from "@/db/client";
import { adminUsers, auditLog, bookings, emailOutbox, seats, tickets } from "@/db/schema";
import { GET as exportRoute } from "@/app/api/admin/export/route";
import { POST as resendRoute } from "@/app/api/admin/bookings/[id]/resend/route";
import { createSession } from "@/server/auth/session";
import { getDashboard } from "@/server/admin/dashboard";
import { searchBookings } from "@/server/admin/bookings";
import { csvField, exportCsv } from "@/server/admin/export";
import { resendTickets } from "@/server/admin/bookings";
import { setEmailSenderForTests } from "@/server/email/sender";
import { settleKickedOutbox } from "@/server/email/kickOutbox";
import { confirmBooking } from "@/server/payments/confirmBooking";
import { FakeEmailSender } from "../helpers/fakes";
import { guest, guestN, holdWithOrder } from "../helpers/holds";
import { seedVenue } from "../helpers/db";

const ORIGIN = "http://localhost:3000";
const UNKNOWN = "00000000-0000-4000-8000-000000000000";

let adminId: string;
let seatIds: string[];
let sender: FakeEmailSender;

beforeEach(async () => {
  sender = new FakeEmailSender();
  setEmailSenderForTests(sender);
  const [u] = await db.insert(adminUsers).values({ email: "boss@example.com", role: "admin", passwordHash: "x" }).returning();
  adminId = u.id;
  seatIds = (await seedVenue()).seats.map((s) => s.id);
});

afterEach(async () => {
  await settleKickedOutbox();
  setEmailSenderForTests(null);
});

async function paid(ids: string[], who: typeof guest = guest) {
  const b = await holdWithOrder(ids, who);
  await confirmBooking({ orderId: b.orderId, paymentId: `pay_${b.orderId}`, amountPaise: b.amountPaise });
  return b;
}

async function cookieFor(role: "admin" | "scanner") {
  if (role === "admin") return `admin_session=${await createSession(adminId)}`;
  const [u] = await db.insert(adminUsers).values({ email: "gate@example.com", role, passwordHash: "x" }).returning();
  return `admin_session=${await createSession(u.id)}`;
}

function req(method: string, path: string, cookie?: string, origin: string | null = ORIGIN) {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: { ...(origin ? { origin } : {}), ...(cookie ? { cookie } : {}) },
  });
}

test("dashboard counts per tier and revenue", async () => {
  await paid([seatIds[0], seatIds[1]]); // Gold x2 = 3000.00
  await paid([seatIds[10]], guestN(2)); // Silver x1 = 800.00
  await db.update(seats).set({ status: "blocked" }).where(eq(seats.id, seatIds[5]));
  const d = await getDashboard();
  const gold = d.tiers.find((t) => t.name === "Gold")!;
  const silver = d.tiers.find((t) => t.name === "Silver")!;
  expect(gold).toEqual({ name: "Gold", available: 7, held: 0, sold: 2, blocked: 1, comp: 0 });
  expect(silver).toEqual({ name: "Silver", available: 9, held: 0, sold: 1, blocked: 0, comp: 0 });
  expect(d.revenuePaise).toBe(380000);
  expect(d.recent).toHaveLength(2);
  expect(d.recent[0]).toMatchObject({ publicCode: expect.any(String), status: "paid", seatCount: 1, amountPaise: 80000 });
});

test("expired hold not counted as held; live hold is", async () => {
  const now = new Date();
  await holdWithOrder([seatIds[0]], guest, new Date(now.getTime() - 60 * 60_000)); // expired an hour ago
  await holdWithOrder([seatIds[1]], guestN(2), now);
  const gold = (await getDashboard(now)).tiers.find((t) => t.name === "Gold")!;
  expect(gold.held).toBe(1);
  expect(gold.available).toBe(9);
});

test("comp seats counted under comp not sold; refunds excluded from revenue", async () => {
  const a = await paid([seatIds[0]]);
  await paid([seatIds[1]], guestN(2));
  const c = await paid([seatIds[2]], guestN(3));
  const r = await paid([seatIds[3]], guestN(4));
  await db.update(bookings).set({ status: "comp" }).where(eq(bookings.id, a.bookingId));
  await db.update(bookings).set({ status: "refund_due" }).where(eq(bookings.id, c.bookingId));
  await db.update(bookings).set({ status: "refunded" }).where(eq(bookings.id, r.bookingId));
  const d = await getDashboard();
  const gold = d.tiers.find((t) => t.name === "Gold")!;
  expect(gold.comp).toBe(1);
  expect(gold.sold).toBe(1);
  expect(d.revenuePaise).toBe(150000);
});

test("search by phone in any format, code, email and name", async () => {
  const b = await paid([seatIds[0]]);
  await paid([seatIds[1]], guestN(2));
  for (const q of ["9876543210", "+91 98765 43210", "098765-43210"]) {
    expect((await searchBookings(q)).map((x) => x.id)).toEqual([b.bookingId]);
  }
  const [code] = (await db.select({ c: bookings.publicCode }).from(bookings).where(eq(bookings.id, b.bookingId)));
  expect((await searchBookings(code.c.toLowerCase())).map((x) => x.id)).toEqual([b.bookingId]);
  expect((await searchBookings("ASHA@exam")).map((x) => x.id)).toEqual([b.bookingId]);
  expect((await searchBookings("asha r")).map((x) => x.id)).toEqual([b.bookingId]);
  expect(await searchBookings("a")).toEqual([]);
});

test("search escapes % and _ wildcards", async () => {
  await paid([seatIds[0]]);
  expect(await searchBookings("%")).toEqual([]);
  expect(await searchBookings("%%")).toEqual([]);
  expect(await searchBookings("as_a")).toEqual([]);
});

test("resend creates outbox row and audit entry", async () => {
  const b = await paid([seatIds[0]]);
  const before = await db.select().from(emailOutbox).where(eq(emailOutbox.bookingId, b.bookingId));
  await resendTickets(b.bookingId, adminId);
  const rows = await db.select().from(emailOutbox).where(eq(emailOutbox.bookingId, b.bookingId));
  expect(rows).toHaveLength(before.length + 1);
  expect(rows.filter((r) => r.kind === "tickets" && r.status === "pending").length).toBeGreaterThanOrEqual(1);
  const [a] = await db.select().from(auditLog).where(eq(auditLog.action, "resend_tickets"));
  expect(a.adminUserId).toBe(adminId);
  expect(a.details).toMatchObject({ bookingId: b.bookingId, publicCode: expect.any(String) });
});

test("resend on pending booking is 409, unknown is 404, and writes nothing", async () => {
  const b = await holdWithOrder([seatIds[0]]);
  await expect(resendTickets(b.bookingId, adminId)).rejects.toMatchObject({ code: "NOT_RESENDABLE", status: 409 });
  await expect(resendTickets(UNKNOWN, adminId)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  expect(await db.select().from(emailOutbox)).toHaveLength(0);
  expect(await db.select().from(auditLog)).toHaveLength(0);
});

test("export escapes commas and neutralizes =cmd()", async () => {
  const b = await paid([seatIds[0]], { name: '=cmd("x"),Rao', email: "asha@example.com", phone: "+919876543210" });
  const csv = await exportCsv();
  const lines = csv.split("\r\n");
  expect(lines[0]).toBe("booking_code,status,name,email,phone,seat,tier,price_inr,paid_at,checked_in_at");
  const [code] = await db.select({ c: bookings.publicCode }).from(bookings).where(eq(bookings.id, b.bookingId));
  expect(lines[1]).toMatch(new RegExp(`^${code.c},paid,"'=cmd\\(""x""\\),Rao",asha@example.com,\\+919876543210,G-A-1,Gold,1500\\.00,`));
  expect(lines[2]).toBe("");
});

test("export: IST timestamps, check-in, excludes pending/refunded, orders by code then seat", async () => {
  const a = await paid([seatIds[1], seatIds[0]]);
  await paid([seatIds[2]], guestN(2));
  const pend = await holdWithOrder([seatIds[3]], guestN(3));
  const ref = await paid([seatIds[4]], guestN(4));
  await db.update(bookings).set({ status: "refunded" }).where(eq(bookings.id, ref.bookingId));
  await db.update(bookings).set({ paidAt: new Date("2026-11-05T13:00:00Z") }).where(eq(bookings.id, a.bookingId));
  await db.update(tickets).set({ checkedInAt: new Date("2026-11-05T14:00:00Z") }).where(eq(tickets.seatId, seatIds[0]));
  const csv = await exportCsv();
  expect(csv.endsWith("\r\n")).toBe(true);
  const rows = csv.trimEnd().split("\r\n").slice(1).map((l) => l.split(","));
  expect(rows).toHaveLength(3);
  const codes = rows.map((r) => r[0]);
  expect(codes).toEqual([...codes].sort());
  const mine = rows.filter((r) => r[3] === "asha@example.com");
  expect(mine.map((r) => r[5])).toEqual(["G-A-1", "G-A-2"]);
  expect(mine[0][8]).toBe("2026-11-05T18:30:00+05:30");
  expect(mine[0][9]).toBe("2026-11-05T19:30:00+05:30");
  expect(mine[1][9]).toBe("");
  expect(csv).not.toContain(pend.bookingId);
  expect(csv).not.toContain("guest4@example.com");
  expect(csv).not.toContain("guest3@example.com");
});

test("GET /api/admin/export: BOM, headers, audit; scanner 403, anon 401", async () => {
  await paid([seatIds[0]]);
  const res = await exportRoute(req("GET", "/api/admin/export", await cookieFor("admin")));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
  expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="bookings-\d{8}\.csv"$/);
  const bytes = new Uint8Array(await res.arrayBuffer());
  expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes).slice(1)).toMatch(/^booking_code,.*\r\n/);
  expect(await db.select().from(auditLog).where(eq(auditLog.action, "export_csv"))).toHaveLength(1);
  expect((await exportRoute(req("GET", "/api/admin/export", await cookieFor("scanner")))).status).toBe(403);
  expect((await exportRoute(req("GET", "/api/admin/export"))).status).toBe(401);
});

test("POST resend route: ok, bad uuid 400, 409, scanner 403, anon 401, no Origin 403", async () => {
  const b = await paid([seatIds[0]]);
  const path = `/api/admin/bookings/${b.bookingId}/resend`;
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const admin = await cookieFor("admin");
  const ok = await resendRoute(req("POST", path, admin), ctx(b.bookingId));
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({ ok: true });
  await settleKickedOutbox();
  expect(sender.sent.length).toBeGreaterThan(0);
  expect((await resendRoute(req("POST", "/api/admin/bookings/nope/resend", admin), ctx("nope"))).status).toBe(400);
  const pend = await holdWithOrder([seatIds[1]], guestN(2));
  expect((await resendRoute(req("POST", path, admin), ctx(pend.bookingId))).status).toBe(409);
  expect((await resendRoute(req("POST", path, await cookieFor("scanner")), ctx(b.bookingId))).status).toBe(403);
  expect((await resendRoute(req("POST", path), ctx(b.bookingId))).status).toBe(401);
  expect((await resendRoute(req("POST", path, admin, null), ctx(b.bookingId))).status).toBe(403);
});

test.each([
  ["+91987", "+91987"],
  ["+1+2", "'+1+2"],
  ["+A1", "'+A1"],
  ["-5", "'-5"],
  ["=1+1", "'=1+1"],
  ["@x", "'@x"],
])("csvField(%s)", (input, expected) => {
  expect(csvField(input)).toBe(expected);
});
