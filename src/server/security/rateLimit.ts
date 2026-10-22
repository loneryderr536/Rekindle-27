import { sql } from "drizzle-orm";
import { db } from "@/db/client";

/**
 * Fixed-window counter. The increment is a single atomic upsert, so concurrent
 * callers can never both observe a count under the limit.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  now: Date = new Date(),
): Promise<{ ok: boolean; retryAfter: number }> {
  const nowSec = Math.floor(now.getTime() / 1000);
  const startSec = Math.floor(nowSec / windowSeconds) * windowSeconds;
  const windowStart = new Date(startSec * 1000);
  const { rows } = await db.execute<{ count: number }>(sql`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
    RETURNING count`);
  return { ok: rows[0].count <= limit, retryAfter: startSec + windowSeconds - nowSec };
}
