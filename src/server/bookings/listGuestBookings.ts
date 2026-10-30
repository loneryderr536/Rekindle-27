import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { Booking } from "@/db/schema";

export type GuestBooking = {
  id: string;
  publicCode: string;
  accessToken: string;
  status: Booking["status"];
  amountPaise: number;
  holdExpiresAt: Date;
  createdAt: Date;
  seats: { label: string; tierName: string }[];
};

type Row = {
  id: string; public_code: string; access_token: string; status: Booking["status"];
  amount_paise: number; hold_expires_at: Date; created_at: Date;
};

/** The guest's bookings (matched on trimmed, lower-cased email), newest first; skips expired and lapsed holds. */
export async function listGuestBookings(email: string, now: Date = new Date()): Promise<GuestBooking[]> {
  const { rows } = await db.execute<Row>(sql`
    SELECT id, public_code, access_token, status, amount_paise, hold_expires_at, created_at
      FROM bookings
     WHERE lower(trim(email)) = lower(trim(${email}))
       AND status <> 'expired'
       AND NOT (status = 'pending' AND hold_expires_at <= ${now})
     ORDER BY created_at DESC, id`);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const items = await db.execute<{ booking_id: string; label: string; tier_name: string }>(sql`
    SELECT bi.booking_id, s.label, bi.tier_name
      FROM booking_items bi
      JOIN seats s ON s.id = bi.seat_id
     WHERE bi.booking_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
     ORDER BY s.label`);
  const byBooking = new Map<string, { label: string; tierName: string }[]>();
  for (const it of items.rows) {
    const list = byBooking.get(it.booking_id) ?? [];
    list.push({ label: it.label, tierName: it.tier_name });
    byBooking.set(it.booking_id, list);
  }
  return rows.map((r) => ({
    id: r.id,
    publicCode: r.public_code,
    accessToken: r.access_token,
    status: r.status,
    amountPaise: r.amount_paise,
    holdExpiresAt: new Date(r.hold_expires_at),
    createdAt: new Date(r.created_at),
    seats: byBooking.get(r.id) ?? [],
  }));
}
