import { inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { seats, tiers } from "@/db/schema";
import { AppError } from "@/lib/errors";

export type VenueRow = { section: string; row: string; number: number; x: number; y: number; tier: string };

const HEADER = ["section", "row", "number", "x", "y", "tier"];

function invalid(message: string): AppError {
  return new AppError("INVALID_CSV", message, 400);
}

/** Parses the venue CSV (`section,row,number,x,y,tier`). Errors name the 1-based line number. */
export function parseVenueCsv(text: string): VenueRow[] {
  const lines = text.split(/\r?\n/);
  const header = (lines[0] ?? "").split(",").map((c) => c.trim());
  if (header.length !== HEADER.length || header.some((h, i) => h !== HEADER[i])) {
    throw invalid(`line 1: header must be exactly "${HEADER.join(",")}"`);
  }
  const rows: VenueRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;
    const lineNo = i + 1;
    const cells = lines[i].split(",").map((c) => c.trim());
    if (cells.length !== HEADER.length) {
      throw invalid(`line ${lineNo}: expected ${HEADER.length} columns, got ${cells.length}`);
    }
    const [section, row, numberStr, xStr, yStr, tier] = cells;
    if (!section || !row || !tier) throw invalid(`line ${lineNo}: section, row and tier are required`);
    if (!/^\d+$/.test(numberStr) || Number(numberStr) < 1) {
      throw invalid(`line ${lineNo}: number must be a positive integer`);
    }
    const x = xStr === "" ? NaN : Number(xStr);
    const y = yStr === "" ? NaN : Number(yStr);
    if (!Number.isFinite(x)) throw invalid(`line ${lineNo}: x must be a number`);
    if (!Number.isFinite(y)) throw invalid(`line ${lineNo}: y must be a number`);
    rows.push({ section, row, number: Number(numberStr), x, y, tier });
  }
  return rows;
}

/**
 * Upserts seats by label (`section-row-number`) in one transaction. Existing seats are only
 * updated while `available`; held/sold/blocked seats are left untouched.
 */
export async function importSeats(rows: VenueRow[]): Promise<{ inserted: number }> {
  if (rows.length === 0) return { inserted: 0 };
  return db.transaction(async (tx) => {
    const names = [...new Set(rows.map((r) => r.tier))];
    const found = await tx.select({ id: tiers.id, name: tiers.name }).from(tiers).where(inArray(tiers.name, names));
    const tierIds = new Map(found.map((t) => [t.name, t.id]));
    for (const name of names) {
      if (!tierIds.has(name)) throw invalid(`Unknown tier "${name}"; create it before importing seats`);
    }

    // Last occurrence wins for duplicate labels (a single upsert statement can't touch a row twice).
    const byLabel = new Map<string, typeof seats.$inferInsert>();
    for (const r of rows) {
      const label = `${r.section}-${r.row}-${r.number}`;
      byLabel.set(label, {
        label, section: r.section, row: r.row, number: r.number, x: r.x, y: r.y, tierId: tierIds.get(r.tier)!,
      });
    }

    let inserted = 0;
    const values = [...byLabel.values()];
    for (let i = 0; i < values.length; i += 500) {
      const res = await tx
        .insert(seats)
        .values(values.slice(i, i + 500))
        .onConflictDoUpdate({
          target: seats.label,
          set: {
            section: sql`excluded.section`,
            row: sql`excluded.row`,
            number: sql`excluded.number`,
            x: sql`excluded.x`,
            y: sql`excluded.y`,
            tierId: sql`excluded.tier_id`,
          },
          setWhere: sql`${seats.status} = 'available'`,
        })
        .returning({ inserted: sql<boolean>`(xmax = 0)` });
      inserted += res.filter((r) => r.inserted).length;
    }
    return { inserted };
  });
}
