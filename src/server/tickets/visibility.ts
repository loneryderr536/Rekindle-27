import type { Booking } from "@/db/schema";

/** QR codes are shown (page) only for bookings that are paid or complimentary. */
export function ticketsVisible(status: Booking["status"]): boolean {
  return status === "paid" || status === "comp";
}
