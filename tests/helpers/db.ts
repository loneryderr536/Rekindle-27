import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import type { Seat, Tier } from "@/db/schema";

const TABLES = [
  "tiers", "seats", "bookings", "booking_items", "tickets", "admin_users",
  "admin_sessions", "audit_log", "email_outbox", "webhook_events", "rate_limits",
];

/** Safety guard: tests must never truncate a non-test database. */
export function assertTestDatabase(name: string): void {
  if (!name.endsWith("_test")) {
    throw new Error(
      `Refusing to reset database "${name}": test database names must end with "_test". ` +
        "Check that .env.test exists and DATABASE_URL points at booking_test.",
    );
  }
}

let verifiedDb = false;

export async function resetDb(): Promise<void> {
  if (!verifiedDb) {
    const res = await db.execute(sql`SELECT current_database() AS name`);
    assertTestDatabase(String((res.rows[0] as { name: string }).name));
    verifiedDb = true;
  }
  const list = TABLES.map((t) => `"${t}"`).join(", ");
  await db.execute(sql.raw(`TRUNCATE ${list} RESTART IDENTITY CASCADE`));
}

export async function seedVenue(
  opts: { tiers?: { name: string; pricePaise: number; color?: string }[]; seatsPerTier?: number } = {},
): Promise<{ tiers: Tier[]; seats: Seat[] }> {
  const defs = opts.tiers ?? [
    { name: "Gold", pricePaise: 150000, color: "#d4a017" },
    { name: "Silver", pricePaise: 80000, color: "#9ca3af" },
  ];
  const n = opts.seatsPerTier ?? 10;
  const tiers = await db
    .insert(schema.tiers)
    .values(defs.map((t, i) => ({ name: t.name, pricePaise: t.pricePaise, color: t.color ?? "#888888", sortOrder: i })))
    .returning();
  const seats = await db
    .insert(schema.seats)
    .values(
      tiers.flatMap((tier, ti) =>
        Array.from({ length: n }, (_, k) => {
          const section = tier.name[0].toUpperCase();
          const number = k + 1;
          return {
            label: `${section}-A-${number}`, section, row: "A", number,
            x: number * 30, y: ti * 40, tierId: tier.id, status: "available" as const,
          };
        }),
      ),
    )
    .returning();
  return { tiers, seats };
}

/** Drizzle wraps driver errors ("Failed query: ..."); assert on the underlying Postgres message. */
export async function expectPgError(p: PromiseLike<unknown>, pattern: RegExp): Promise<void> {
  try {
    await p;
  } catch (e) {
    const cause = (e as { cause?: { message?: string } }).cause;
    const msg = cause?.message ?? (e as Error).message;
    if (!pattern.test(msg)) throw new Error(`Expected Postgres error ${pattern}, got: ${msg}`);
    return;
  }
  throw new Error(`Expected Postgres error ${pattern}, but the statement succeeded`);
}
