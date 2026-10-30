import type { Booking } from "@/db/schema";
import { getGuest, type Guest } from "@/server/guestAuth/getGuest";
import { ticketsVisible } from "@/server/tickets/visibility";

/**
 * Straight after paying (`?paid=1`), a signed-in guest who owns a booking whose tickets are ready lands
 * on My bookings. A pending booking stays on the ticket page (it waits for the bank and refreshes itself).
 * Returns the redirect target, or null. The guest is only looked up when `paid=1`.
 */
export async function postPaymentRedirect(
  booking: Pick<Booking, "email" | "status" | "publicCode">,
  paidParam: string | string[] | undefined,
  loadGuest: () => Promise<Guest | null> = getGuest,
): Promise<string | null> {
  if (paidParam !== "1") return null;
  if (!ticketsVisible(booking.status)) return null;
  const guest = await loadGuest();
  if (!guest || booking.email.trim().toLowerCase() !== guest.email) return null;
  return `/my-bookings?new=${encodeURIComponent(booking.publicCode)}`;
}
