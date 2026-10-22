import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { AppError } from "@/lib/errors";
import { normalizeIndianPhone } from "@/lib/phone";
import { publicCode, randomToken } from "@/lib/random";
import { logAudit } from "@/server/admin/audit";
import { createTicketsForBooking, type Tx } from "@/server/tickets/tokens";

/** Seat IDs: 1..50 unique UUIDs per comp; block/unblock/assign allow a larger batch. */
const uniqueIds = (max: number) =>
  z.array(z.uuid()).min(1).max(max).refine((a) => new Set(a).size === a.length, "Duplicate seat IDs");

export const BulkSeatIds = uniqueIds(1000);

export const CompInput = z.object({
  seatIds: uniqueIds(50),
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  phone: z.string(),
});
export type CompInput = z.input<typeof CompInput>;

/** Locks the given seat rows in id order (the shared lock order) and returns the ids that exist. */
export async function lockSeats(tx: Tx, seatIds: string[]): Promise<string[]> {
  const { rows } = await tx.execute<{ id: string }>(sql`
    SELECT id FROM seats WHERE id = ANY(${sql.param(seatIds)}::uuid[]) ORDER BY id FOR UPDATE`);
  return rows.map((r) => r.id);
}

export function assertSeatsExist(requested: string[], existing: string[]): void {
  const have = new Set(existing);
  const unknown = requested.filter((id) => !have.has(id));
  if (unknown.length > 0) throw new AppError("INVALID_SEATS", "Unknown seat IDs", 400, { seatIds: unknown });
}

async function transition(
  seatIds: string[], from: "available" | "blocked", to: "available" | "blocked", adminUserId: string, action: string,
): Promise<{ changed: string[]; skipped: string[] }> {
  const ids = BulkSeatIds.parse(seatIds);
  return db.transaction(async (tx) => {
    assertSeatsExist(ids, await lockSeats(tx, ids));
    const { rows } = await tx.execute<{ id: string }>(sql`
      UPDATE seats SET status = ${to}
       WHERE id = ANY(${sql.param(ids)}::uuid[]) AND status = ${from}
      RETURNING id`);
    const changed = rows.map((r) => r.id);
    const done = new Set(changed);
    const skipped = ids.filter((id) => !done.has(id));
    await logAudit(adminUserId, action, { changed, skipped }, tx);
    return { changed, skipped };
  });
}

/** Takes available seats off sale. Seats in any other status are skipped. */
export async function blockSeats(seatIds: string[], adminUserId: string) {
  const { changed, skipped } = await transition(seatIds, "available", "blocked", adminUserId, "block_seats");
  return { blocked: changed, skipped };
}

/** Puts blocked seats back on sale. Seats in any other status are skipped. */
export async function unblockSeats(seatIds: string[], adminUserId: string) {
  const { changed, skipped } = await transition(seatIds, "blocked", "available", adminUserId, "unblock_seats");
  return { unblocked: changed, skipped };
}

/**
 * Gives complimentary seats to a guest: a `comp` booking (amount 0), sold seats, price-0 items,
 * tickets and a ticket email. All-or-nothing: if any seat is not available/blocked/expired-held,
 * nothing changes and SEATS_TAKEN is thrown.
 */
export async function issueComp(
  input: CompInput, adminUserId: string, now: Date = new Date(),
): Promise<{ bookingId: string; publicCode: string; accessToken: string }> {
  const p = CompInput.parse(input);
  const phone = normalizeIndianPhone(p.phone);
  if (!phone) throw new AppError("INVALID_PHONE", "Invalid Indian mobile number", 400);
  const code = publicCode();
  const accessToken = randomToken();

  return db.transaction(async (tx) => {
    // Insert the booking first (nothing else locks it), then lock seats in id order.
    const { rows: [booking] } = await tx.execute<{ id: string }>(sql`
      INSERT INTO bookings (public_code, access_token, name, email, phone, status, amount_paise, seat_count, hold_expires_at, paid_at)
      VALUES (${code}, ${accessToken}, ${p.name}, ${p.email}, ${phone}, 'comp', 0, ${p.seatIds.length}, ${now}, ${now})
      RETURNING id`);
    const ids = sql.param(p.seatIds);
    assertSeatsExist(p.seatIds, await lockSeats(tx, p.seatIds));
    const { rows: sold } = await tx.execute<{ id: string }>(sql`
      UPDATE seats SET status = 'sold', booking_id = ${booking.id}, held_until = NULL
       WHERE id = ANY(${ids}::uuid[])
         AND (status IN ('available', 'blocked') OR (status = 'held' AND held_until <= ${now}))
      RETURNING id`);
    if (sold.length !== p.seatIds.length) {
      const got = new Set(sold.map((r) => r.id));
      throw new AppError("SEATS_TAKEN", "Some of the selected seats are no longer available", 409, {
        seatIds: p.seatIds.filter((id) => !got.has(id)),
      });
    }
    // The gate scanner joins booking_items, so comps need items too (price 0, tier name snapshot).
    await tx.execute(sql`
      INSERT INTO booking_items (booking_id, seat_id, tier_name, price_paise)
      SELECT ${booking.id}, s.id, t.name, 0
        FROM seats s JOIN tiers t ON t.id = s.tier_id
       WHERE s.id = ANY(${ids}::uuid[])`);
    await createTicketsForBooking(tx, booking.id);
    await tx.execute(sql`
      INSERT INTO email_outbox (booking_id, kind, status) VALUES (${booking.id}, 'tickets', 'pending')`);
    await logAudit(adminUserId, "issue_comp", {
      bookingId: booking.id, publicCode: code, seatIds: p.seatIds, name: p.name, email: p.email,
    }, tx);
    return { bookingId: booking.id, publicCode: code, accessToken };
  });
}
