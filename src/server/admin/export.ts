import { sql } from "drizzle-orm";
import { db } from "@/db/client";

export const CSV_HEADER = "booking_code,status,name,email,phone,seat,tier,price_inr,paid_at,checked_in_at";

/** Quotes when needed and neutralises spreadsheet formulas (CSV injection). */
export function csvField(value: string): string {
  // A plus followed only by digits (our normalised phones) cannot be a formula.
  const risky = /^[=+\-@\t\r]/.test(value) && !/^\+\d+$/.test(value);
  const safe = risky ? `'${value}` : value;
  return /[,"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** One row per seat of paid and comp bookings. */
export async function exportCsv(): Promise<string> {
  const ist = (col: string) =>
    sql.raw(`to_char(${col} AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS') || '+05:30'`);
  const { rows } = await db.execute<{
    public_code: string; status: string; name: string; email: string; phone: string; label: string;
    tier_name: string; price_paise: number; paid_at: string | null; checked_in_at: string | null;
  }>(sql`
    SELECT b.public_code, b.status, b.name, b.email, b.phone, s.label, bi.tier_name, bi.price_paise,
           ${ist("b.paid_at")} AS paid_at, ${ist("t.checked_in_at")} AS checked_in_at
      FROM bookings b
      JOIN booking_items bi ON bi.booking_id = b.id
      JOIN seats s ON s.id = bi.seat_id
      LEFT JOIN tickets t ON t.seat_id = bi.seat_id AND t.booking_id = b.id
     WHERE b.status IN ('paid', 'comp')
     ORDER BY b.public_code, s.label`);
  const lines = rows.map((r) =>
    [
      r.public_code, r.status, r.name, r.email, r.phone, r.label, r.tier_name,
      (r.price_paise / 100).toFixed(2), r.paid_at ?? "", r.checked_in_at ?? "",
    ].map(csvField).join(","),
  );
  return [CSV_HEADER, ...lines].join("\r\n") + "\r\n";
}
