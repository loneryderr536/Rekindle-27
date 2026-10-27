import { and, count, eq, gt, inArray, or } from "drizzle-orm";
import { db } from "@/db/client";
import { bookings, discountCodes } from "@/db/schema";
import { normalizeDiscountCode } from "@/lib/discount";
import { AppError } from "@/lib/errors";

export type Discount = { code: string; percent: number };

type Executor = Pick<typeof db, "select">;

function invalid(): AppError {
  return new AppError("INVALID_DISCOUNT", "This discount code isn't valid", 400);
}

/**
 * Resolves a typed code to its discount, or throws INVALID_DISCOUNT (unknown, inactive, expired or used up).
 * Pass `lock` from inside a hold transaction: it row-locks the code so concurrent holds cannot overshoot
 * `maxUses`. A use is a paid, comp or refund-due booking, or a pending one whose hold is still live.
 */
export async function findDiscount(
  raw: string,
  now: Date = new Date(),
  opts: { executor?: Executor; lock?: boolean } = {},
): Promise<Discount> {
  const ex = opts.executor ?? db;
  const code = normalizeDiscountCode(raw);
  if (!code) throw invalid();

  const query = ex.select().from(discountCodes).where(eq(discountCodes.code, code)).limit(1);
  const [row] = await (opts.lock ? query.for("update") : query);
  if (!row || !row.active || (row.expiresAt && row.expiresAt <= now)) throw invalid();

  if (row.maxUses !== null) {
    const [{ used }] = await ex
      .select({ used: count() })
      .from(bookings)
      .where(and(
        eq(bookings.discountCode, row.code),
        or(
          inArray(bookings.status, ["paid", "comp", "refund_due"]),
          and(eq(bookings.status, "pending"), gt(bookings.holdExpiresAt, now)),
        ),
      ));
    if (used >= row.maxUses) throw invalid();
  }
  return { code: row.code, percent: row.percent };
}
