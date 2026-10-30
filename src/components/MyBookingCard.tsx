import Link from "next/link";
import { FinishPayingButton } from "@/components/FinishPayingButton";
import { ResendMyTicketsButton } from "@/components/ResendMyTicketsButton";
import { bookingStatusLabel } from "@/lib/bookingStatus";
import { formatInr } from "@/lib/money";
import type { GuestBooking } from "@/server/bookings/listGuestBookings";

/** One booking on My bookings. The list already hides expired and lapsed holds, so any pending one is payable. */
export function MyBookingCard({ booking, highlight }: { booking: GuestBooking; highlight: boolean }) {
  const confirmed = booking.status === "paid" || booking.status === "comp";
  return (
    <li
      className={`o26-card p-5 ${highlight ? "ring-2 ring-marigold" : ""}`}
      aria-current={highlight ? "true" : undefined}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-display text-2xl font-semibold">{booking.publicCode}</span>
        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${
            confirmed ? "bg-marigold text-ink" : "bg-sand text-ink ring-1 ring-line"
          }`}
        >
          {bookingStatusLabel(booking.status)}
        </span>
        {highlight && <span className="rounded-full bg-ink px-3 py-1 text-sm font-semibold text-paper">Just booked</span>}
        <span className="ml-auto font-semibold tabular-nums">{formatInr(booking.amountPaise)}</span>
      </div>
      <p className="mb-0 mt-3 text-muted">
        {booking.seats.map((s) => `${s.label} (${s.tierName})`).join(", ")}
      </p>
      {confirmed && (
        <div className="mt-4 flex flex-wrap items-start gap-3">
          <Link href={`/booking/${encodeURIComponent(booking.accessToken)}`} className="btn-primary inline-block">
            View tickets
          </Link>
          <ResendMyTicketsButton bookingId={booking.id} />
        </div>
      )}
      {booking.status === "pending" && (
        <div className="mt-4">
          <FinishPayingButton accessToken={booking.accessToken} />
        </div>
      )}
    </li>
  );
}
