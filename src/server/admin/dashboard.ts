import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { Booking } from "@/db/schema";

export type TierCounts = { name: string; available: number; held: number; sold: number; blocked: number; comp: number };
export type BookingSummary = {
  id: string; publicCode: string; name: string; status: Booking["status"];
  amountPaise: number; seatCount: number; createdAt: Date;
};

export type DiscountUsage = { code: string; percent: number; active: boolean; maxUses: number | null; used: number };

export async function getDashboard(now: Date = new Date()): Promise<{
  tiers: TierCounts[]; revenuePaise: number; recent: BookingSummary[]; discounts: DiscountUsage[];
}> {
  const [t, rev, recent, disc] = await Promise.all([
    db.execute<{
      name: string; available: number; held: number; sold: number; blocked: number; comp: number;
    }>(sql`
      SELECT t.name,
             count(*) FILTER (WHERE s.status = 'available' OR (s.status = 'held' AND s.held_until <= ${now}))::int AS available,
             count(*) FILTER (WHERE s.status = 'held' AND s.held_until > ${now})::int AS held,
             count(*) FILTER (WHERE s.status = 'sold' AND b.status = 'paid')::int AS sold,
             count(*) FILTER (WHERE s.status = 'sold' AND b.status = 'comp')::int AS comp,
             count(*) FILTER (WHERE s.status = 'blocked')::int AS blocked
        FROM tiers t
        LEFT JOIN seats s ON s.tier_id = t.id
        LEFT JOIN bookings b ON b.id = s.booking_id
       GROUP BY t.id, t.name, t.sort_order
       ORDER BY t.sort_order, t.name`),
    db.execute<{ total: string }>(sql`
      SELECT COALESCE(sum(amount_paise), 0)::text AS total FROM bookings WHERE status = 'paid'`),
    db.execute<{
      id: string; public_code: string; name: string; status: Booking["status"];
      amount_paise: number; seat_count: number; created_at: Date;
    }>(sql`
      SELECT id, public_code, name, status, amount_paise, seat_count, created_at
        FROM bookings WHERE status <> 'expired'
       ORDER BY created_at DESC, id LIMIT 20`),
    // A "use" matches findDiscount: paid, comp or refund-due bookings, or a pending one whose hold is still live.
    db.execute<{ code: string; percent: number; active: boolean; max_uses: number | null; used: number }>(sql`
      SELECT d.code, d.percent, d.active, d.max_uses,
             count(b.id)::int AS used
        FROM discount_codes d
        LEFT JOIN bookings b ON b.discount_code = d.code
         AND (b.status IN ('paid', 'comp', 'refund_due')
              OR (b.status = 'pending' AND b.hold_expires_at > ${now}))
       GROUP BY d.id, d.code, d.percent, d.active, d.max_uses
       ORDER BY d.code`),
  ]);
  return {
    discounts: disc.rows.map((r) => ({
      code: r.code, percent: r.percent, active: r.active, maxUses: r.max_uses, used: r.used,
    })),
    tiers: t.rows,
    revenuePaise: Number(rev.rows[0].total),
    recent: recent.rows.map((r) => ({
      id: r.id, publicCode: r.public_code, name: r.name, status: r.status,
      amountPaise: r.amount_paise, seatCount: r.seat_count, createdAt: new Date(r.created_at),
    })),
  };
}
