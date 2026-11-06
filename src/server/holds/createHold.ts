import { and, eq, gt, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { bookingItems, bookings, seats, tiers } from "@/db/schema";
import { HOLD_MINUTES, MAX_SEATS_PER_BOOKING } from "@/lib/constants";
import { discountAmountPaise } from "@/lib/discount";
import { AppError } from "@/lib/errors";
import { normalizeIndianPhone } from "@/lib/phone";
import { publicCode, randomToken } from "@/lib/random";
import { findDiscount } from "@/server/discounts/findDiscount";
import { getDefaultTier } from "@/server/seats/defaultTier";

/** Exactly one of `seatIds` (specific seats, used by admin/internal callers) or `seatCount` (the guest
 *  flow: any N available seats of the event's default tier are picked automatically) must be set. */
export type CreateHoldInput = { name: string; email: string; phone: string; clientIp?: string;
  discountCode?: string; guestUserId?: string } & (
    { seatIds: string[]; seatCount?: undefined } | { seatCount: number; seatIds?: undefined }
  );

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
  if (input.seatIds) {
    const duplicates = [...new Set(input.seatIds.filter((id, i) => input.seatIds!.indexOf(id) !== i))];
    if (duplicates.length > 0) {
      throw new AppError("INVALID_SEATS", "Duplicate seat IDs", 400, { seatIds: duplicates });
    }
  } else if (!Number.isInteger(input.seatCount) || input.seatCount < 1 || input.seatCount > MAX_SEATS_PER_BOOKING) {
    throw new AppError("VALIDATION", "seatCount must be between 1 and " + MAX_SEATS_PER_BOOKING, 400);
  }
  const requestedCount = input.seatIds?.length ?? input.seatCount!;
  const phone = normalizeIndianPhone(input.phone);
  if (!phone) throw new AppError("INVALID_PHONE", "Invalid Indian mobile number", 400);
  const email = input.email.trim().toLowerCase();
  const clientIp = input.clientIp && input.clientIp !== "unknown" ? input.clientIp : null;
  const holdExpiresAt = new Date(now.getTime() + HOLD_MINUTES * 60_000);

  try {
    return await db.transaction(async (tx) => {
      // Serialise holds by the same guest so the one-active-hold check is race-free. The client IP is
      // stored but not matched: guests on one office, college or mobile-carrier network share an IP.
      for (const key of [phone, email].sort()) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
      }
      const [active] = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(and(
          eq(bookings.status, "pending"),
          gt(bookings.holdExpiresAt, now),
          or(eq(bookings.phone, phone), eq(bookings.email, email)),
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
          guestUserId: input.guestUserId ?? null,
          status: "pending",
          amountPaise: 0,
          seatCount: requestedCount,
          holdExpiresAt,
        })
        .returning({ id: bookings.id, publicCode: bookings.publicCode, accessToken: bookings.accessToken });

      let heldIds: string[];
      if (input.seatIds) {
        const seatIds = input.seatIds;
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
          const gotIds = new Set(held.map((s) => s.id));
          throw seatsTaken(seatIds.filter((id) => !gotIds.has(id)));
        }
        heldIds = held.map((s) => s.id);
      } else {
        // The guest doesn't choose seats: lock the first `seatCount` available ones in the default
        // tier. SKIP LOCKED means concurrent holds just get disjoint rows instead of deadlocking.
        const tier = await getDefaultTier(tx);
        const { rows: picked } = await tx.execute<{ id: string }>(sql`
          SELECT id FROM seats
           WHERE tier_id = ${tier.id}
             AND (status = 'available' OR (status = 'held' AND held_until <= ${now}))
           ORDER BY section, row, number
             FOR UPDATE SKIP LOCKED
           LIMIT ${input.seatCount}`);
        if (picked.length < input.seatCount) {
          throw new AppError("NOT_ENOUGH_SEATS", "Not enough seats are available", 409);
        }
        const ids = sql.param(picked.map((s) => s.id));
        const { rows: held } = await tx.execute<{ id: string; tier_id: string }>(sql`
          UPDATE seats SET status = 'held', booking_id = ${booking.id}, held_until = ${holdExpiresAt}
           WHERE id = ANY(${ids}::uuid[])
          RETURNING id, tier_id`);
        heldIds = held.map((s) => s.id);
      }

      const priced = await tx
        .select({ seatId: seats.id, tierName: tiers.name, pricePaise: tiers.pricePaise })
        .from(seats)
        .innerJoin(tiers, eq(seats.tierId, tiers.id))
        .where(inArray(seats.id, heldIds));
      await tx.insert(bookingItems).values(priced.map((p) => ({ bookingId: booking.id, ...p })));
      const subtotalPaise = priced.reduce((sum, p) => sum + p.pricePaise, 0);
      const discount = input.discountCode?.trim()
        ? await findDiscount(input.discountCode, now, { executor: tx, lock: true })
        : null;
      const discountPaise = discount ? discountAmountPaise(subtotalPaise, discount.percent) : 0;
      const amountPaise = subtotalPaise - discountPaise;
      await tx
        .update(bookings)
        .set({ amountPaise, subtotalPaise, discountPaise, discountCode: discount?.code ?? null })
        .where(eq(bookings.id, booking.id));

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
    if (code === DEADLOCK || code === SERIALIZATION_FAILURE) {
      if (input.seatIds) throw seatsTaken(input.seatIds);
      throw new AppError("NOT_ENOUGH_SEATS", "Not enough seats are available", 409);
    }
    throw e;
  }
}
