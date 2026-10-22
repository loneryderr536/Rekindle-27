import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { tiers, type Tier } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { logAudit } from "@/server/admin/audit";
import { assertSeatsExist, BulkSeatIds, lockSeats } from "@/server/admin/seats";

const Name = z.string().trim().min(1).max(40);
const PricePaise = z.number().int().min(100); // at least Rs 1
const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const TierCreate = z.object({ name: Name, pricePaise: PricePaise, color: Color });
export const TierUpdate = z
  .object({ name: Name, pricePaise: PricePaise, color: Color })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: unknown; cause?: { code?: unknown } };
  return (err.cause?.code ?? err.code) === "23505";
}

const nameTaken = () => new AppError("TIER_NAME_TAKEN", "A tier with this name already exists", 409);
const notFound = () => new AppError("TIER_NOT_FOUND", "Tier not found", 404);

export async function createTier(input: z.input<typeof TierCreate>, adminUserId: string): Promise<Tier> {
  const v = TierCreate.parse(input);
  try {
    return await db.transaction(async (tx) => {
      const { rows } = await tx.execute<{ next: number }>(sql`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM tiers`);
      const [tier] = await tx.insert(tiers).values({ ...v, sortOrder: Number(rows[0].next) }).returning();
      await logAudit(adminUserId, "create_tier", { tierId: tier.id, new: v }, tx);
      return tier;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw nameTaken();
    throw e;
  }
}

export async function updateTier(
  id: string, input: z.input<typeof TierUpdate>, adminUserId: string,
): Promise<Tier> {
  const v = TierUpdate.parse(input);
  try {
    return await db.transaction(async (tx) => {
      const [old] = await tx.select().from(tiers).where(eq(tiers.id, id)).for("update");
      if (!old) throw notFound();
      const [tier] = await tx.update(tiers).set(v).where(eq(tiers.id, id)).returning();
      const before: Record<string, unknown> = {};
      for (const k of Object.keys(v) as (keyof typeof v)[]) before[k] = old[k];
      await logAudit(adminUserId, "update_tier", { tierId: id, old: before, new: v }, tx);
      return tier;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw nameTaken();
    throw e;
  }
}

/** Moves seats to another tier. All-or-nothing; held (even expired) or sold seats are refused. */
export async function assignSeatsToTier(seatIds: string[], tierId: string, adminUserId: string): Promise<{ assigned: string[] }> {
  const ids = BulkSeatIds.parse(seatIds);
  return db.transaction(async (tx) => {
    const [tier] = await tx.select({ id: tiers.id, name: tiers.name }).from(tiers).where(eq(tiers.id, tierId));
    if (!tier) throw notFound();
    assertSeatsExist(ids, await lockSeats(tx, ids));
    const { rows: locked } = await tx.execute<{ id: string }>(sql`
      SELECT id FROM seats WHERE id = ANY(${sql.param(ids)}::uuid[]) AND status IN ('held', 'sold')`);
    if (locked.length > 0) {
      throw new AppError("SEATS_LOCKED", "Held or sold seats cannot change tier", 409, { seatIds: locked.map((r) => r.id) });
    }
    await tx.execute(sql`UPDATE seats SET tier_id = ${tierId} WHERE id = ANY(${sql.param(ids)}::uuid[])`);
    await logAudit(adminUserId, "assign_tier", { tierId, tierName: tier.name, seatIds: ids }, tx);
    return { assigned: ids };
  });
}
