import { asc } from "drizzle-orm";
import { db } from "@/db/client";
import { tiers } from "@/db/schema";
import { AppError } from "@/lib/errors";

export type DefaultTier = { id: string; name: string; pricePaise: number };

type Executor = Pick<typeof db, "select">;

/**
 * The event's single on-sale tier for guest bookings: whichever sorts first (same order as Admin >
 * Tiers). Pass `executor` from inside a hold transaction so the pick is consistent with the seats
 * locked in that same transaction.
 */
export async function getDefaultTier(executor: Executor = db): Promise<DefaultTier> {
  const [tier] = await executor
    .select({ id: tiers.id, name: tiers.name, pricePaise: tiers.pricePaise })
    .from(tiers)
    .orderBy(asc(tiers.sortOrder), asc(tiers.name))
    .limit(1);
  if (!tier) throw new AppError("NO_TIER_CONFIGURED", "No ticket tier is configured yet", 503);
  return tier;
}
