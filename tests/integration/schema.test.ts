import { describe, expect, test } from "vitest";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { expectPgError, seedVenue } from "../helpers/db";

async function insertBooking(suffix: string) {
  const [b] = await db
    .insert(schema.bookings)
    .values({
      publicCode: `RK${suffix}`,
      accessToken: `tok-${suffix}`,
      name: "A",
      email: "a@example.com",
      phone: "9999999999",
      status: "paid",
      amountPaise: 150000,
      seatCount: 1,
      holdExpiresAt: new Date(),
    })
    .returning();
  return b;
}

describe("schema constraints", () => {
  test("seat label is unique", async () => {
    const { seats } = await seedVenue();
    const { id, ...rest } = seats[0];
    expect(id).toBeTruthy();
    await expectPgError(db.insert(schema.seats).values(rest), /duplicate key/);
  });

  test("one ticket per seat", async () => {
    const { seats } = await seedVenue();
    const b = await insertBooking("AAAA");
    await db.insert(schema.tickets).values({ bookingId: b.id, seatId: seats[0].id, token: "t1" });
    await expectPgError(db.insert(schema.tickets).values({ bookingId: b.id, seatId: seats[0].id, token: "t2" }), /duplicate key/);
  });

  test("price must be positive", async () => {
    await expectPgError(db.insert(schema.tiers).values({ name: "Free", pricePaise: 0, color: "#000", sortOrder: 0 }), /check constraint/);
  });

  test("razorpay order id is unique", async () => {
    const b = await insertBooking("BBBB");
    const mk = (n: string) =>
      db.insert(schema.bookings).values({
        publicCode: n, accessToken: n, name: "A", email: "a@e.com", phone: "1",
        status: "pending", amountPaise: 1, seatCount: 1, holdExpiresAt: new Date(),
        razorpayOrderId: "order_1",
      });
    await mk("C1");
    await expectPgError(mk("C2"), /duplicate key/);
    expect(b.createdAt).toBeInstanceOf(Date);
  });

  test("seedVenue defaults and resetDb isolation", async () => {
    const { tiers, seats } = await seedVenue();
    expect(tiers.map((t) => [t.name, t.pricePaise])).toEqual([["Gold", 150000], ["Silver", 80000]]);
    expect(seats).toHaveLength(20);
    expect(seats[0].label).toBe("G-A-1");
    expect(seats[0].status).toBe("available");
  });

  test("db is empty at start of each test", async () => {
    expect(await db.select().from(schema.seats)).toHaveLength(0);
  });
});
