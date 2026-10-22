import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { Booking } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { normalizeIndianPhone } from "@/lib/phone";
import { logAudit } from "./audit";
import type { BookingSummary } from "./dashboard";

function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Admin lookup by booking code, email, phone (any format) or name. Newest first. */
export async function searchBookings(q: string, limit = 50): Promise<BookingSummary[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const like = `%${escapeLike(term)}%`;
  const phone = normalizeIndianPhone(term);
  const phoneMatch = phone ? sql`OR phone = ${phone}` : sql``;
  const { rows } = await db.execute<{
    id: string; public_code: string; name: string; status: Booking["status"];
    amount_paise: number; seat_count: number; created_at: Date;
  }>(sql`
    SELECT id, public_code, name, status, amount_paise, seat_count, created_at
      FROM bookings
     WHERE upper(public_code) = upper(${term})
        OR email ILIKE ${like}
        OR name ILIKE ${like}
        ${phoneMatch}
     ORDER BY created_at DESC, id
     LIMIT ${limit}`);
  return rows.map((r) => ({
    id: r.id, publicCode: r.public_code, name: r.name, status: r.status,
    amountPaise: r.amount_paise, seatCount: r.seat_count, createdAt: r.created_at,
  }));
}

export type AdminBookingDetail = {
  id: string; publicCode: string; name: string; email: string; phone: string;
  status: Booking["status"]; amountPaise: number; paidAt: Date | null; createdAt: Date;
  seats: { label: string; tierName: string; pricePaise: number; checkedInAt: Date | null; gate: string | null }[];
};

export async function getBookingDetail(id: string): Promise<AdminBookingDetail | null> {
  const { rows } = await db.execute<{
    id: string; public_code: string; name: string; email: string; phone: string;
    status: Booking["status"]; amount_paise: number; paid_at: Date | null; created_at: Date;
  }>(sql`
    SELECT id, public_code, name, email, phone, status, amount_paise, paid_at, created_at
      FROM bookings WHERE id = ${id}`);
  const b = rows[0];
  if (!b) return null;
  const items = await db.execute<{
    label: string; tier_name: string; price_paise: number; checked_in_at: Date | null; gate: string | null;
  }>(sql`
    SELECT s.label, bi.tier_name, bi.price_paise, t.checked_in_at, t.gate
      FROM booking_items bi
      JOIN seats s ON s.id = bi.seat_id
      LEFT JOIN tickets t ON t.seat_id = bi.seat_id AND t.booking_id = bi.booking_id
     WHERE bi.booking_id = ${id}
     ORDER BY s.label`);
  return {
    id: b.id, publicCode: b.public_code, name: b.name, email: b.email, phone: b.phone,
    status: b.status, amountPaise: b.amount_paise, paidAt: b.paid_at, createdAt: b.created_at,
    seats: items.rows.map((r) => ({
      label: r.label, tierName: r.tier_name, pricePaise: r.price_paise, checkedInAt: r.checked_in_at, gate: r.gate,
    })),
  };
}

/** Queues a fresh tickets email for a paid/comp booking and audits it, atomically. */
export async function resendTickets(bookingId: string, adminUserId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const { rows } = await tx.execute<{ public_code: string; status: Booking["status"] }>(sql`
      SELECT public_code, status FROM bookings WHERE id = ${bookingId} FOR SHARE`);
    const b = rows[0];
    if (!b) throw new AppError("NOT_FOUND", "Booking not found", 404);
    if (b.status !== "paid" && b.status !== "comp") {
      throw new AppError("NOT_RESENDABLE", "Tickets can only be resent for confirmed bookings", 409);
    }
    await tx.execute(sql`INSERT INTO email_outbox (booking_id, kind) VALUES (${bookingId}, 'tickets')`);
    await logAudit(adminUserId, "resend_tickets", { bookingId, publicCode: b.public_code }, tx);
  });
}
