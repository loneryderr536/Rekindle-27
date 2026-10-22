import type { Booking } from "@/db/schema";

const LABELS: Record<Booking["status"], string> = {
  paid: "Confirmed",
  comp: "Confirmed",
  pending: "Payment processing",
  expired: "Expired",
  refund_due: "Refund in progress",
  refunded: "Refunded",
};

/** Attendee-facing label for a booking status. */
export function bookingStatusLabel(status: Booking["status"]): string {
  return LABELS[status];
}
