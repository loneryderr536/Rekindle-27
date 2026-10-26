/**
 * Imports seats from a venue CSV (`section,row,number,x,y,tier`).
 *
 * Usage: npm run seed:seats -- scripts/sample-venue.csv [--create-tiers]
 *
 * Tiers referenced by the CSV must already exist (create them in Admin > Tiers), or pass
 * `--create-tiers` to create every missing one: Gold (Rs 1,500) and Silver (Rs 800) get their usual
 * prices, any other name a placeholder price that you must set in Admin > Tiers before launch.
 * Re-running is safe: existing available seats are updated, non-available seats are left untouched.
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

  const { closeDb } = await import("../src/db/client");
  const { createMissingTiers, importSeats, parseVenueCsv, PLACEHOLDER_TIER_PRICE_PAISE } = await import(
    "../src/server/seats/importSeats"
  );
  try {
    const rows = parseVenueCsv(readFileSync(file, "utf8"));
    if (createTiers) {
      const created = await createMissingTiers(rows);
      for (const t of created) console.log(`created tier "${t.name}" at ${t.pricePaise / 100} INR`);
      const placeholders = created.filter((t) => t.pricePaise === PLACEHOLDER_TIER_PRICE_PAISE);
      if (placeholders.length > 0) {
        console.warn(
          `WARNING: ${placeholders.map((t) => `"${t.name}"`).join(", ")} got a placeholder price. ` +
            "Set the real price in Admin > Tiers before tickets go on sale.",
        );
      }
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
