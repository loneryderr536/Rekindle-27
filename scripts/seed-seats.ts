/**
 * Imports seats from a venue CSV (`section,row,number,x,y,tier`).
 *
 * Usage: npm run seed:seats -- scripts/sample-venue.csv [--create-tiers]
 *
 * Tiers referenced by the CSV must already exist (the admin tiers page arrives in a later
 * task). Pass `--create-tiers` to insert Gold (150000 paise, #d4a017) and Silver (80000 paise,
 * #9ca3af) if they are missing. Re-running is safe: existing available seats are updated,
 * non-available seats are left untouched.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";

async function main() {
  config({ path: [".env.local", ".env"], quiet: true }); // DATABASE_URL already in the environment wins
  const args = process.argv.slice(2);
  const createTiers = args.includes("--create-tiers");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("Usage: npm run seed:seats -- <venue.csv> [--create-tiers]");
    process.exit(1);
  }

  const { db, closeDb } = await import("../src/db/client");
  const { tiers } = await import("../src/db/schema");
  const { importSeats, parseVenueCsv } = await import("../src/server/seats/importSeats");
  try {
    const rows = parseVenueCsv(readFileSync(file, "utf8"));
    if (createTiers) {
      await db
        .insert(tiers)
        .values([
          { name: "Gold", pricePaise: 150000, color: "#d4a017", sortOrder: 0 },
          { name: "Silver", pricePaise: 80000, color: "#9ca3af", sortOrder: 1 },
        ])
        .onConflictDoNothing({ target: tiers.name });
    }
    const { inserted } = await importSeats(rows);
    console.log(`inserted: ${inserted}`);
  } finally {
    await closeDb();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
