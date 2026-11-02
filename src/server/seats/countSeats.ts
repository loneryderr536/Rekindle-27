import { sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/db/client";

/**
 * Seats on sale for the event (everything on the map except blocked seats); shown on the landing page.
 * Cached for 60s so a traffic surge on the landing page doesn't hammer Postgres with the same query.
 */
export const countSeats = unstable_cache(
  async (): Promise<number> => {
    const r = await db.execute<{ total: number }>(sql`
      SELECT count(*)::int AS total FROM seats WHERE status <> 'blocked'`);
    return r.rows[0].total;
  },
  ["count-seats"],
  { revalidate: 60 },
);
