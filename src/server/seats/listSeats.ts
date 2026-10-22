import { asc } from "drizzle-orm";
import { db } from "@/db/client";
import { seats, tiers } from "@/db/schema";

export type SeatStatus = "available" | "held" | "sold" | "blocked";

export type SeatView = {
  id: string;
  label: string;
  section: string;
  row: string;
  number: number;
  x: number;
  y: number;
  tierId: string;
  status: SeatStatus;
};

export type TierView = { id: string; name: string; pricePaise: number; color: string };

/** Public seat map: holds that have expired by `now` are reported as available. */
export async function listSeats(now: Date = new Date()): Promise<{ seats: SeatView[]; tiers: TierView[] }> {
  const [seatRows, tierRows] = await Promise.all([
    db
      .select({
        id: seats.id, label: seats.label, section: seats.section, row: seats.row, number: seats.number,
        x: seats.x, y: seats.y, tierId: seats.tierId, status: seats.status, heldUntil: seats.heldUntil,
      })
      .from(seats)
      .orderBy(asc(seats.section), asc(seats.row), asc(seats.number)),
    db
      .select({ id: tiers.id, name: tiers.name, pricePaise: tiers.pricePaise, color: tiers.color })
      .from(tiers)
      .orderBy(asc(tiers.sortOrder), asc(tiers.name)),
  ]);
  return {
    seats: seatRows.map(({ heldUntil, status, ...s }) => ({
      ...s,
      status: status === "held" && heldUntil !== null && heldUntil <= now ? "available" : status,
    })),
    tiers: tierRows,
  };
}
