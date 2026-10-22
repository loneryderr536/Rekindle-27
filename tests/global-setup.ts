import { config } from "dotenv";
import path from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

export default async function setup() {
  config({ path: path.resolve(import.meta.dirname, "../.env.test"), override: true, quiet: true });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: path.resolve(import.meta.dirname, "../src/db/migrations"),
    });
  } finally {
    await pool.end();
  }
}
