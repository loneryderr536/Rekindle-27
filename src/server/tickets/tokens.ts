import { sql } from "drizzle-orm";
import type { db } from "@/db/client";
import { randomToken } from "@/lib/random";

/** A Drizzle transaction handle (the callback argument of `db.transaction`). */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const QR_PREFIX = "RKT1:";
const QR_PATTERN = /^RKT1:([A-Za-z0-9_-]{43})$/;

/** Ticket token: 32 random bytes, base64url (43 chars). */
export function newTicketToken(): string {
  return randomToken(32);
}

/** The exact text encoded in a ticket's QR code. */
export function qrPayload(token: string): string {
  return `${QR_PREFIX}${token}`;
}

/** Extracts the token from scanned QR text, or null if it is not a ticket payload. */
export function parseQrPayload(text: string): string | null {
  const m = QR_PATTERN.exec(text);
  return m ? m[1] : null;
}

/** Inserts one ticket (with a fresh token) per booking_items row of the booking. */
export async function createTicketsForBooking(tx: Tx, bookingId: string): Promise<void> {
  const { rows } = await tx.execute<{ seat_id: string }>(sql`
    SELECT seat_id FROM booking_items WHERE booking_id = ${bookingId} ORDER BY seat_id`);
  if (rows.length === 0) return;
  const seatIds = rows.map((r) => r.seat_id);
  const tokens = seatIds.map(() => newTicketToken());
  await tx.execute(sql`
    INSERT INTO tickets (booking_id, seat_id, token)
    SELECT ${bookingId}, u.seat_id, u.token
      FROM unnest(${sql.param(seatIds)}::uuid[], ${sql.param(tokens)}::text[]) AS u(seat_id, token)`);
}
