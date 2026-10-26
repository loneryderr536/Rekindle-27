import { sql } from "drizzle-orm";
import { db } from "@/db/client";

/** Seats on sale for the event (everything on the map except blocked seats); shown on the landing page. */
export async function countSeats(): Promise<number> {
  const r = await db.execute<{ total: number }>(sql`
    SELECT count(*)::int AS total FROM seats WHERE status <> 'blocked'`);
  return r.rows[0].total;
}
