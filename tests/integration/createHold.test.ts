import { eq, sql } from "drizzle-orm";
import { expect, test } from "vitest";
import { db } from "@/db/client";
import { bookingItems, bookings, seats } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { createHold } from "@/server/holds/createHold";
import { HoldInput } from "@/server/holds/schemas";
import { listSeats } from "@/server/seats/listSeats";
import { seedVenue } from "../helpers/db";
import { guest, guestN, statusOf } from "../helpers/holds";

const MIN = 60_000;

async function venue() {
  const v = await seedVenue();
  const gold = v.seats.filter((s) => s.tierId === v.tiers[0].id);
  const silver = v.seats.filter((s) => s.tierId === v.tiers[1].id);
  return { ...v, gold, silver };
}

async function bookingCount(): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(bookings);
  return r.n;
}

async function expectAppError(p: Promise<unknown>, code: string, status: number): Promise<AppError> {
  const e = await p.then(
    () => { throw new Error(`expected ${code}, but it succeeded`); },
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(AppError);
  expect((e as AppError).code).toBe(code);
  expect((e as AppError).status).toBe(status);
  return e as AppError;
}

test("holds 2 seats and prices from tiers", async () => {
  const { gold, silver } = await venue();
  const r = await createHold({ seatIds: [gold[0].id, silver[0].id], ...guest });
  expect(r.amountPaise).toBe(150000 + 80000);
  expect(await statusOf(gold[0].id)).toBe("held");
  expect(await statusOf(silver[0].id)).toBe("held");
  expect(r.holdExpiresAt.getTime() - Date.now()).toBeCloseTo(10 * MIN, -3);
  expect(r.publicCode).toMatch(/^[A-Z2-9]{6}$/);
  expect(r.accessToken.length).toBeGreaterThanOrEqual(43);

  const [b] = await db.select().from(bookings).where(eq(bookings.id, r.bookingId));
  expect(b).toMatchObject({
    status: "pending", amountPaise: 230000, seatCount: 2, publicCode: r.publicCode,
    accessToken: r.accessToken, email: guest.email, phone: guest.phone,
  });
  expect(b.holdExpiresAt.getTime()).toBe(r.holdExpiresAt.getTime());

  const held = await db.select().from(seats).where(eq(seats.bookingId, r.bookingId));
  expect(held).toHaveLength(2);
  for (const s of held) expect(s.heldUntil!.getTime()).toBe(r.holdExpiresAt.getTime());

  const items = await db.select().from(bookingItems).where(eq(bookingItems.bookingId, r.bookingId));
  expect(items.map((i) => [i.seatId, i.tierName, i.pricePaise]).sort()).toEqual(
    [[gold[0].id, "Gold", 150000], [silver[0].id, "Silver", 80000]].sort(),
  );
});

test("holds the maximum 6 seats in one array-bound statement", async () => {
  const { gold, silver } = await venue();
  const ids = [...gold.slice(0, 3), ...silver.slice(0, 3)].map((s) => s.id);
  const r = await createHold({ seatIds: ids, ...guest });
  expect(r.amountPaise).toBe(3 * 150000 + 3 * 80000);
  for (const id of ids) expect(await statusOf(id)).toBe("held");
  expect(await statusOf(gold[3].id)).toBe("available");
});

test("stores normalized email and phone", async () => {
  const { gold } = await venue();
  const r = await createHold({
    seatIds: [gold[0].id], name: "Asha", email: "  Asha@Example.COM ", phone: "098765 43210",
  });
  const [b] = await db.select().from(bookings).where(eq(bookings.id, r.bookingId));
  expect(b.email).toBe("asha@example.com");
  expect(b.phone).toBe("+919876543210");
});

test("second hold on same seat → SEATS_TAKEN, no booking row left", async () => {
  const { gold } = await venue();
  await createHold({ seatIds: [gold[0].id], ...guest });
  const e = await expectAppError(createHold({ seatIds: [gold[0].id], ...guestN(1) }), "SEATS_TAKEN", 409);
  expect(e.details).toEqual({ seatIds: [gold[0].id] });
  expect(await bookingCount()).toBe(1);
});

test("group hold is all-or-nothing", async () => {
  const { gold } = await venue();
  const [a, b] = gold;
  await createHold({ seatIds: [b.id], ...guest });
  const e = await expectAppError(createHold({ seatIds: [a.id, b.id], ...guestN(1) }), "SEATS_TAKEN", 409);
  expect(e.details).toEqual({ seatIds: [b.id] });
  expect(await statusOf(a.id)).toBe("available");
  const [aRow] = await db.select().from(seats).where(eq(seats.id, a.id));
  expect(aRow.bookingId).toBeNull();
  expect(aRow.heldUntil).toBeNull();
  expect(await bookingCount()).toBe(1);
  expect(await db.select().from(bookingItems)).toHaveLength(1);
});

test("expired hold is reclaimable", async () => {
  const { gold } = await venue();
  const t = new Date("2026-11-01T10:00:00Z");
  const first = await createHold({ seatIds: [gold[0].id], ...guest }, t);
  const later = new Date(t.getTime() + 11 * MIN);
  const second = await createHold({ seatIds: [gold[0].id], ...guestN(1) }, later);
  expect(second.holdExpiresAt.getTime()).toBe(later.getTime() + 10 * MIN);
  const [row] = await db.select().from(seats).where(eq(seats.id, gold[0].id));
  expect(row.bookingId).toBe(second.bookingId);
  expect(row.bookingId).not.toBe(first.bookingId);
});

test("hold is not reclaimable before it expires", async () => {
  const { gold } = await venue();
  const t = new Date("2026-11-01T10:00:00Z");
  await createHold({ seatIds: [gold[0].id], ...guest }, t);
  await expectAppError(
    createHold({ seatIds: [gold[0].id], ...guestN(1) }, new Date(t.getTime() + 9 * MIN)),
    "SEATS_TAKEN", 409,
  );
});

test("duplicate seat IDs → INVALID_SEATS", async () => {
  const { gold } = await venue();
  const e = await expectAppError(
    createHold({ seatIds: [gold[0].id, gold[1].id, gold[0].id], ...guest }), "INVALID_SEATS", 400,
  );
  expect(e.details).toEqual({ seatIds: [gold[0].id] });
  expect(await statusOf(gold[0].id)).toBe("available");
  expect(await bookingCount()).toBe(0);
});

test("unknown seat ID → INVALID_SEATS and no booking row", async () => {
  const { gold } = await venue();
  const unknown = "00000000-0000-4000-8000-000000000000";
  const e = await expectAppError(createHold({ seatIds: [gold[0].id, unknown], ...guest }), "INVALID_SEATS", 400);
  expect(e.details).toEqual({ seatIds: [unknown] });
  expect(await statusOf(gold[0].id)).toBe("available");
  expect(await bookingCount()).toBe(0);
});

test("blocked seat → SEATS_TAKEN", async () => {
  const { gold } = await venue();
  await db.update(seats).set({ status: "blocked" }).where(eq(seats.id, gold[1].id));
  const e = await expectAppError(createHold({ seatIds: [gold[0].id, gold[1].id], ...guest }), "SEATS_TAKEN", 409);
  expect(e.details).toEqual({ seatIds: [gold[1].id] });
  expect(await statusOf(gold[0].id)).toBe("available");
  expect(await bookingCount()).toBe(0);
});

test("sold seat → SEATS_TAKEN", async () => {
  const { gold } = await venue();
  await db.update(seats).set({ status: "sold" }).where(eq(seats.id, gold[0].id));
  await expectAppError(createHold({ seatIds: [gold[0].id], ...guest }), "SEATS_TAKEN", 409);
});

test("same phone in other format with active hold → ACTIVE_HOLD_EXISTS", async () => {
  const { gold } = await venue();
  await createHold({ seatIds: [gold[0].id], ...guest });
  await expectAppError(
    createHold({ seatIds: [gold[1].id], name: "Other", email: "other@example.com", phone: "98765 43210" }),
    "ACTIVE_HOLD_EXISTS", 409,
  );
  expect(await statusOf(gold[1].id)).toBe("available");
  expect(await bookingCount()).toBe(1);
});

test("same email in other case with active hold → ACTIVE_HOLD_EXISTS", async () => {
  const { gold } = await venue();
  await createHold({ seatIds: [gold[0].id], ...guest });
  await expectAppError(
    createHold({ seatIds: [gold[1].id], name: "Other", email: " ASHA@example.com", phone: "+919000000001" }),
    "ACTIVE_HOLD_EXISTS", 409,
  );
});

test("same client IP with active hold → ACTIVE_HOLD_EXISTS", async () => {
  const { gold } = await venue();
  await createHold({ seatIds: [gold[0].id], ...guestN(1), clientIp: "1.2.3.4" });
  await expectAppError(
    createHold({ seatIds: [gold[1].id], ...guestN(2), clientIp: "1.2.3.4" }),
    "ACTIVE_HOLD_EXISTS", 409,
  );
  expect(await statusOf(gold[1].id)).toBe("available");
  expect(await bookingCount()).toBe(1);
  const [b] = await db.select().from(bookings);
  expect(b.clientIp).toBe("1.2.3.4");
});

test("different client IPs do not block each other", async () => {
  const { gold } = await venue();
  await createHold({ seatIds: [gold[0].id], ...guestN(1), clientIp: "1.2.3.4" });
  const r = await createHold({ seatIds: [gold[1].id], ...guestN(2), clientIp: "1.2.3.5" });
  expect(r.amountPaise).toBe(150000);
});

test("missing or unknown client IP is never matched", async () => {
  const { gold } = await venue();
  await createHold({ seatIds: [gold[0].id], ...guestN(1), clientIp: "unknown" });
  await createHold({ seatIds: [gold[1].id], ...guestN(2), clientIp: "unknown" });
  await createHold({ seatIds: [gold[2].id], ...guestN(3) });
  await createHold({ seatIds: [gold[3].id], ...guestN(4) });
  expect(await bookingCount()).toBe(4);
});

test("an expired hold from the same IP does not block", async () => {
  const { gold } = await venue();
  const t = new Date("2026-11-01T10:00:00Z");
  await createHold({ seatIds: [gold[0].id], ...guestN(1), clientIp: "1.2.3.4" }, t);
  const r = await createHold(
    { seatIds: [gold[1].id], ...guestN(2), clientIp: "1.2.3.4" }, new Date(t.getTime() + 11 * MIN),
  );
  expect(r.amountPaise).toBe(150000);
});

test("an expired pending hold does not block a new one for the same guest", async () => {
  const { gold } = await venue();
  const t = new Date("2026-11-01T10:00:00Z");
  await createHold({ seatIds: [gold[0].id], ...guest }, t);
  const r = await createHold({ seatIds: [gold[1].id], ...guest }, new Date(t.getTime() + 11 * MIN));
  expect(r.amountPaise).toBe(150000);
});

test("listSeats reports expired hold as available", async () => {
  const { gold, silver, tiers } = await venue();
  const t = new Date("2026-11-01T10:00:00Z");
  await createHold({ seatIds: [gold[0].id], ...guest }, t);
  await createHold({ seatIds: [gold[1].id], ...guestN(1) }, new Date(t.getTime() + 5 * MIN));
  await db.update(seats).set({ status: "blocked" }).where(eq(seats.id, silver[0].id));
  await db.update(seats).set({ status: "sold" }).where(eq(seats.id, silver[1].id));

  const before = await listSeats(new Date(t.getTime() + 1 * MIN));
  const byId = (r: typeof before, id: string) => r.seats.find((s) => s.id === id)!.status;
  expect(byId(before, gold[0].id)).toBe("held");

  const after = await listSeats(new Date(t.getTime() + 11 * MIN));
  expect(byId(after, gold[0].id)).toBe("available");
  expect(byId(after, gold[1].id)).toBe("held");
  expect(byId(after, gold[2].id)).toBe("available");
  expect(byId(after, silver[0].id)).toBe("blocked");
  expect(byId(after, silver[1].id)).toBe("sold");

  expect(after.seats).toHaveLength(20);
  expect(after.seats[0]).toEqual({
    id: gold[0].id, label: gold[0].label, section: "G", row: "A", number: 1,
    x: gold[0].x, y: gold[0].y, tierId: tiers[0].id, status: "available",
  });
  expect(after.seats.map((s) => s.label).slice(0, 3)).toEqual(["G-A-1", "G-A-2", "G-A-3"]);
  expect(after.tiers).toEqual([
    { id: tiers[0].id, name: "Gold", pricePaise: 150000, color: "#d4a017" },
    { id: tiers[1].id, name: "Silver", pricePaise: 80000, color: "#9ca3af" },
  ]);
});

test("HoldInput validates and normalizes", () => {
  const ok = HoldInput.parse({
    seatIds: ["00000000-0000-4000-8000-000000000000"], name: "  Asha  ",
    email: "asha@example.com", phone: "98765 43210", turnstileToken: "t",
  });
  expect(ok.phone).toBe("+919876543210");
  expect(ok.name).toBe("Asha");
  const base = { seatIds: ok.seatIds, name: "Asha", email: "asha@example.com", phone: "9876543210", turnstileToken: "t" };
  expect(HoldInput.safeParse({ ...base, phone: "12345" }).success).toBe(false);
  expect(HoldInput.safeParse({ ...base, seatIds: [] }).success).toBe(false);
  expect(HoldInput.safeParse({ ...base, seatIds: Array(7).fill(ok.seatIds[0]) }).success).toBe(false);
  expect(HoldInput.safeParse({ ...base, seatIds: ["nope"] }).success).toBe(false);
  expect(HoldInput.safeParse({ ...base, email: "nope" }).success).toBe(false);
  expect(HoldInput.safeParse({ ...base, name: "A" }).success).toBe(false);
});
