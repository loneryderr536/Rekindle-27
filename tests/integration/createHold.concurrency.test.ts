import { eq, inArray } from "drizzle-orm";
import { expect, test } from "vitest";
import { db } from "@/db/client";
import { bookingItems, bookings, seats } from "@/db/schema";
import { createHold } from "@/server/holds/createHold";
import { seedVenue } from "../helpers/db";
import { guestN } from "../helpers/holds";

type Settled = PromiseSettledResult<Awaited<ReturnType<typeof createHold>>>;
const codeOf = (r: Settled) => (r.status === "rejected" ? (r.reason as { code?: string }).code : undefined);

test("50 parallel holds on one seat → exactly one wins", async () => {
  const { seats: all } = await seedVenue();
  const results = await Promise.allSettled(
    Array.from({ length: 50 }, (_, i) => createHold({ seatIds: [all[0].id], ...guestN(i) })),
  );
  const won = results.filter((r) => r.status === "fulfilled");
  expect(won).toHaveLength(1);
  expect(results.filter((r) => codeOf(r) === "SEATS_TAKEN")).toHaveLength(49);

  const [seat] = await db.select().from(seats).where(eq(seats.id, all[0].id));
  expect(seat.status).toBe("held");
  expect(seat.bookingId).toBe(won[0].status === "fulfilled" && won[0].value.bookingId);
  expect(await db.select().from(bookings)).toHaveLength(1);
});

test("overlapping group holds never partially succeed", async () => {
  const { seats: all } = await seedVenue();
  const [s0, s1, s2] = all;
  const requests = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? [s0.id, s1.id] : [s2.id, s1.id]));
  const results = await Promise.allSettled(
    requests.map((seatIds, i) => createHold({ seatIds, ...guestN(i) })),
  );

  const winners = results.flatMap((r, i) =>
    r.status === "fulfilled" ? [{ bookingId: r.value.bookingId, seatIds: requests[i] }] : [],
  );
  // s1 is in every request, so exactly one can win.
  expect(winners).toHaveLength(1);
  for (const r of results) if (r.status === "rejected") expect(codeOf(r)).toBe("SEATS_TAKEN");

  const rows = await db.select().from(seats).where(inArray(seats.id, [s0.id, s1.id, s2.id]));
  for (const row of rows) {
    const owner = winners.find((w) => w.seatIds.includes(row.id));
    if (owner) {
      expect(row.status).toBe("held");
      expect(row.bookingId).toBe(owner.bookingId);
    } else {
      expect(row.status).toBe("available");
      expect(row.bookingId).toBeNull();
    }
  }
  expect(await db.select().from(bookings)).toHaveLength(1);
  expect(await db.select().from(bookingItems)).toHaveLength(2);
});

test("disjoint parallel holds all succeed", async () => {
  const { seats: all } = await seedVenue();
  const results = await Promise.allSettled(
    all.slice(0, 20).map((s, i) => createHold({ seatIds: [s.id], ...guestN(i) })),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(20);
});

test("parallel holds by the same guest → only one active hold", async () => {
  const { seats: all } = await seedVenue();
  const g = guestN(0);
  const results = await Promise.allSettled(
    all.slice(0, 20).map((s, i) => createHold({ seatIds: [s.id], ...g, phone: i % 2 ? g.phone : g.phone.slice(3) })),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => codeOf(r) === "ACTIVE_HOLD_EXISTS")).toHaveLength(19);
});
