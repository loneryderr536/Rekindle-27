import { and, eq, gt, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { bookingItems, bookings, seats, tiers } from "@/db/schema";
import { HOLD_MINUTES } from "@/lib/constants";
import { AppError } from "@/lib/errors";
import { normalizeIndianPhone } from "@/lib/phone";
import { publicCode, randomToken } from "@/lib/random";

export type CreateHoldInput = { seatIds: string[]; name: string; email: string; phone: string; clientIp?: string };

export type HoldResult = {
  bookingId: string;
  publicCode: string;
  accessToken: string;
  amountPaise: number;
  holdExpiresAt: Date;
};

const DEADLOCK = "40P01";
const SERIALIZATION_FAILURE = "40001";

/** Postgres SQLSTATE of an error, looking through Drizzle's query-error wrapper. */
function pgCode(e: unknown): string | undefined {
  const err = e as { code?: unknown; cause?: { code?: unknown } };
  const code = err.cause?.code ?? err.code;
  return typeof code === "string" ? code : undefined;
}

function seatsTaken(seatIds: string[]): AppError {
  return new AppError("SEATS_TAKEN", "Some of the selected seats are no longer available", 409, { seatIds });
}

/**
 * Atomically holds the given seats for a new pending booking (all-or-nothing).
 * All time comparisons use `now`, so callers (and tests) control the clock.
 */
export async function createHold(input: CreateHoldInput, now: Date = new Date()): Promise<HoldResult> {
  const seatIds = input.seatIds;
  const duplicates = [...new Set(seatIds.filter((id, i) => seatIds.indexOf(id) !== i))];
  if (duplicates.length > 0) {
    throw new AppError("INVALID_SEATS", "Duplicate seat IDs", 400, { seatIds: duplicates });
  }
  const phone = normalizeIndianPhone(input.phone);
  if (!phone) throw new AppError("INVALID_PHONE", "Invalid Indian mobile number", 400);
  const email = input.email.trim().toLowerCase();
  const clientIp = input.clientIp && input.clientIp !== "unknown" ? input.clientIp : null;
  const holdExpiresAt = new Date(now.getTime() + HOLD_MINUTES * 60_000);

  try {
    return await db.transaction(async (tx) => {
      // Serialise holds by the same guest so the one-active-hold check is race-free.
      for (const key of [phone, email, ...(clientIp ? [clientIp] : [])].sort()) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
      }
      const [active] = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(and(
          eq(bookings.status, "pending"),
          gt(bookings.holdExpiresAt, now),
          or(
            eq(bookings.phone, phone),
            eq(bookings.email, email),
            ...(clientIp ? [eq(bookings.clientIp, clientIp)] : []),
          ),
        ))
        .limit(1);
      if (active) {
        throw new AppError("ACTIVE_HOLD_EXISTS", "You already have an active seat hold", 409);
      }

      const [booking] = await tx
        .insert(bookings)
        .values({
          publicCode: publicCode(),
          accessToken: randomToken(),
          name: input.name,
          email,
          phone,
          clientIp,
          status: "pending",
          amountPaise: 0,
          seatCount: seatIds.length,
          holdExpiresAt,
        })
        .returning({ id: bookings.id, publicCode: bookings.publicCode, accessToken: bookings.accessToken });

      // Lock requested rows in a deterministic order so overlapping group holds cannot deadlock.
      // sql.param binds the array as ONE uuid[] parameter (a bare ${seatIds} would expand to a row).
      const ids = sql.param(seatIds);
      const { rows: existing } = await tx.execute<{ id: string }>(sql`
        SELECT id FROM seats WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`);

      // Spec §5 conditional update, with `now` as a parameter instead of SQL now().
      const { rows: held } = await tx.execute<{ id: string; tier_id: string }>(sql`
        UPDATE seats
           SET status = 'held', booking_id = ${booking.id}, held_until = ${holdExpiresAt}
         WHERE id = ANY(${ids}::uuid[])
           AND (status = 'available'
                OR (status = 'held' AND held_until <= ${now}))
        RETURNING id, tier_id`);

      if (held.length !== seatIds.length) {
        const existingIds = new Set(existing.map((s) => s.id));
        const unknown = seatIds.filter((id) => !existingIds.has(id));
        if (unknown.length > 0) {
          throw new AppError("INVALID_SEATS", "Unknown seat IDs", 400, { seatIds: unknown });
        }
        const heldIds = new Set(held.map((s) => s.id));
        throw seatsTaken(seatIds.filter((id) => !heldIds.has(id)));
      }

      const priced = await tx
        .select({ seatId: seats.id, tierName: tiers.name, pricePaise: tiers.pricePaise })
        .from(seats)
        .innerJoin(tiers, eq(seats.tierId, tiers.id))
        .where(inArray(seats.id, seatIds));
      await tx.insert(bookingItems).values(priced.map((p) => ({ bookingId: booking.id, ...p })));
      const amountPaise = priced.reduce((sum, p) => sum + p.pricePaise, 0);
      await tx.update(bookings).set({ amountPaise }).where(eq(bookings.id, booking.id));

      return {
        bookingId: booking.id,
        publicCode: booking.publicCode,
        accessToken: booking.accessToken,
        amountPaise,
        holdExpiresAt,
      };
    });
  } catch (e) {
    const code = pgCode(e);
    if (code === DEADLOCK || code === SERIALIZATION_FAILURE) throw seatsTaken(seatIds);
    throw e;
  }
}
