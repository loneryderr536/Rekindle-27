import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { Booking } from "@/db/schema";

export type TicketInfo = {
  seatLabel: string;
  tierName: string;
  pricePaise: number;
  /** Null until the booking is confirmed (tickets are created on payment). */
  token: string | null;
};

export type BookingWithTickets = Pick<
  Booking,
  "id" | "publicCode" | "accessToken" | "name" | "email" | "status" | "amountPaise" | "refundAmountPaise" | "seatCount"
  | "paidAt"
> & { tickets: TicketInfo[] };

type BookingRow = {
  id: string; public_code: string; access_token: string; name: string; email: string;
  status: Booking["status"]; amount_paise: number; refund_amount_paise: number | null; seat_count: number;
  paid_at: Date | null;
};

/** The booking plus one entry per seat (ordered by seat label), or null if it does not exist. */
export async function loadBookingWithTickets(bookingId: string): Promise<BookingWithTickets | null> {
  const { rows } = await db.execute<BookingRow>(sql`
    SELECT id, public_code, access_token, name, email, status, amount_paise, refund_amount_paise, seat_count, paid_at
      FROM bookings WHERE id = ${bookingId}`);
  const b = rows[0];
  if (!b) return null;
  const items = await db.execute<{ label: string; tier_name: string; price_paise: number; token: string | null }>(sql`
    SELECT s.label, bi.tier_name, bi.price_paise, t.token
      FROM booking_items bi
      JOIN seats s ON s.id = bi.seat_id
      LEFT JOIN tickets t ON t.seat_id = bi.seat_id AND t.booking_id = bi.booking_id
     WHERE bi.booking_id = ${bookingId}
     ORDER BY s.label`);
  return {
    id: b.id,
    publicCode: b.public_code,
    accessToken: b.access_token,
    name: b.name,
    email: b.email,
    status: b.status,
    amountPaise: b.amount_paise,
    refundAmountPaise: b.refund_amount_paise,
    seatCount: b.seat_count,
    paidAt: b.paid_at ? new Date(b.paid_at) : null,
    tickets: items.rows.map((r) => ({
      seatLabel: r.label, tierName: r.tier_name, pricePaise: r.price_paise, token: r.token,
    })),
  };
}

export async function getBookingByAccessToken(token: string): Promise<BookingWithTickets | null> {
  const { rows } = await db.execute<{ id: string }>(sql`SELECT id FROM bookings WHERE access_token = ${token}`);
  return rows[0] ? loadBookingWithTickets(rows[0].id) : null;
}
