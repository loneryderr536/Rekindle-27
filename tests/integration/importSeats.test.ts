import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { db } from "@/db/client";
import { seats, tiers } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { importSeats, parseVenueCsv } from "@/server/seats/importSeats";

const HEADER = "section,row,number,x,y,tier";

async function seedTiers() {
  await db.insert(tiers).values([
    { name: "Gold", pricePaise: 150000, color: "#d4a017" },
    { name: "Silver", pricePaise: 80000, color: "#9ca3af" },
  ]);
}

test("parseVenueCsv parses rows, trims, skips blank lines", () => {
  const rows = parseVenueCsv(`${HEADER}\n A , B , 3 , 10.5 , 20 , Gold \n\n\nA,B,4,11,20,Silver\n`);
  expect(rows).toEqual([
    { section: "A", row: "B", number: 3, x: 10.5, y: 20, tier: "Gold" },
    { section: "A", row: "B", number: 4, x: 11, y: 20, tier: "Silver" },
  ]);
});

test("parseVenueCsv reports bad line", () => {
  expect(() => parseVenueCsv(`${HEADER}\nA,B,x,1,1,Gold`)).toThrow(/line 2/);
  expect(() => parseVenueCsv(`${HEADER}\nA,B,1,1,1,Gold\nA,B,0,1,1,Gold`)).toThrow(/line 3/);
  expect(() => parseVenueCsv(`${HEADER}\nA,B,1,nope,1,Gold`)).toThrow(/line 2/);
  expect(() => parseVenueCsv(`${HEADER}\nA,B,1,1,1`)).toThrow(/line 2/);
  expect(() => parseVenueCsv(`${HEADER}\nA,B,1,1,1,`)).toThrow(/line 2/);
});

test("parseVenueCsv rejects wrong header with INVALID_CSV", () => {
  try {
    parseVenueCsv("a,b,c\n1,2,3");
    throw new Error("should have thrown");
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).code).toBe("INVALID_CSV");
  }
});

test("importSeats is idempotent", async () => {
  await seedTiers();
  const rows = parseVenueCsv(`${HEADER}\nA,A,1,10,10,Gold\nA,A,2,20,10,Gold\nB,C,1,10,50,Silver`);
  expect(await importSeats(rows)).toEqual({ inserted: 3 });
  expect(await importSeats(rows)).toEqual({ inserted: 0 });
  const all = await db.select().from(seats);
  expect(all.map((s) => s.label).sort()).toEqual(["A-A-1", "A-A-2", "B-C-1"]);
});

test("importSeats updates available seats but never touches non-available ones", async () => {
  await seedTiers();
  await importSeats(parseVenueCsv(`${HEADER}\nA,A,1,10,10,Gold\nA,A,2,20,10,Gold`));
  await db.update(seats).set({ status: "sold" }).where(eq(seats.label, "A-A-2"));

  const res = await importSeats(parseVenueCsv(`${HEADER}\nA,A,1,99,99,Silver\nA,A,2,99,99,Silver`));
  expect(res).toEqual({ inserted: 0 });

  const [silver] = await db.select().from(tiers).where(eq(tiers.name, "Silver"));
  const [s1] = await db.select().from(seats).where(eq(seats.label, "A-A-1"));
  const [s2] = await db.select().from(seats).where(eq(seats.label, "A-A-2"));
  expect(s1).toMatchObject({ x: 99, y: 99, tierId: silver.id, status: "available" });
  expect(s2).toMatchObject({ x: 20, y: 10, status: "sold" });
  expect(s2.tierId).not.toBe(silver.id);
});

test("importSeats rejects unknown tier naming it, and imports nothing", async () => {
  await seedTiers();
  const rows = parseVenueCsv(`${HEADER}\nA,A,1,10,10,Gold\nA,A,2,20,10,Platinum`);
  await expect(importSeats(rows)).rejects.toMatchObject({ code: "INVALID_CSV", message: expect.stringContaining("Platinum") });
  expect(await db.select().from(seats)).toHaveLength(0);
});
