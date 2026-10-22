import path from "node:path";
import { hash } from "@node-rs/argon2";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { ADMIN, SCANNER } from "./helpers";

/** Migrates booking_test, empties it, and seeds 6 Gold + 6 Silver seats and the two staff users. */
export default async function globalSetup() {
  config({ path: path.resolve(import.meta.dirname, "../../.env.test"), override: true, quiet: true });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query<{ name: string }>("SELECT current_database() AS name");
    if (!rows[0].name.endsWith("_test")) {
      throw new Error(`Refusing to reset database "${rows[0].name}": E2E only runs against a *_test database.`);
    }
    await migrate(drizzle(pool), { migrationsFolder: path.resolve(import.meta.dirname, "../../src/db/migrations") });

    await pool.query(
      `TRUNCATE tiers, seats, bookings, booking_items, tickets, admin_users, admin_sessions, audit_log,
                email_outbox, webhook_events, rate_limits RESTART IDENTITY CASCADE`,
    );

    const tiers = [
      { name: "Gold", pricePaise: 150000, color: "#d4a017" },
      { name: "Silver", pricePaise: 80000, color: "#9ca3af" },
    ];
    for (const [ti, t] of tiers.entries()) {
      const { rows: [tier] } = await pool.query<{ id: string }>(
        "INSERT INTO tiers (name, price_paise, color, sort_order) VALUES ($1, $2, $3, $4) RETURNING id",
        [t.name, t.pricePaise, t.color, ti],
      );
      const section = t.name[0];
      for (let n = 1; n <= 6; n++) {
        await pool.query(
          `INSERT INTO seats (label, section, "row", number, x, y, tier_id) VALUES ($1, $2, 'A', $3, $4, $5, $6)`,
          [`${section}-A-${n}`, section, n, n * 30, ti * 40, tier.id],
        );
      }
    }

    for (const u of [ADMIN, SCANNER]) {
      await pool.query("INSERT INTO admin_users (email, password_hash, role) VALUES ($1, $2, $3)", [
        u.email,
        await hash(u.password),
        u.role,
      ]);
    }
  } finally {
    await pool.end();
  }
}
