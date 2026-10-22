import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/AutoRefresh";
import { bookingStatusLabel } from "@/lib/bookingStatus";
import { EVENT } from "@/lib/event";
import { formatInr } from "@/lib/money";
import { getBookingByAccessToken } from "@/server/tickets/loadBooking";
import { qrDataUrl } from "@/server/tickets/qr";
import { qrPayload } from "@/server/tickets/tokens";
import { ticketsVisible } from "@/server/tickets/visibility";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your booking", robots: { index: false } };

const PENDING_REFRESH_MS = 5000;

export default async function BookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const b = await getBookingByAccessToken(token);
  if (!b) notFound();

  const showTickets = ticketsVisible(b.status);
  const qrs = showTickets
    ? await Promise.all(b.tickets.map((t) => (t.token ? qrDataUrl(qrPayload(t.token)) : null)))
    : [];

  return (
    <main className="flex flex-1 flex-col">
      {b.status === "pending" && <AutoRefresh ms={PENDING_REFRESH_MS} />}
      <header className="bg-plum px-4 pb-8 pt-8 text-white">
        <div className="mx-auto max-w-xl">
          <p className="text-white/80">{EVENT.name}</p>
          <h1 className="font-display mt-1 text-4xl font-bold">Booking {b.publicCode}</h1>
          <p className="mt-2 text-white/80">{EVENT.date}, {EVENT.venue}</p>
        </div>
      </header>

      <section className="mx-auto w-full max-w-xl px-4 py-6">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              showTickets ? "bg-marigold text-plum" : "bg-white text-ink ring-1 ring-line"
            }`}
          >
            {bookingStatusLabel(b.status)}
          </span>
          <span className="text-muted">{b.name}</span>
          <span className="ml-auto font-semibold tabular-nums">{formatInr(b.amountPaise)}</span>
        </div>

        {b.status === "pending" && (
          <p className="mt-4" aria-live="polite">
            We&apos;re waiting for your bank to confirm the payment. This page updates on its own and your tickets
            appear here once it&apos;s confirmed.
          </p>
        )}
        {b.status === "expired" && (
          <p className="mt-4">
            This booking expired before payment was completed. <Link href="/" className="underline">Pick seats again</Link>.
          </p>
        )}
        {(b.status === "refund_due" || b.status === "refunded") && (
          <p className="mt-4">
            {b.status === "refunded"
              ? `Your payment of ${formatInr(b.refundAmountPaise ?? b.amountPaise)} has been refunded.`
              : "We could not confirm your seats. Your payment will be refunded to your original payment method."}
          </p>
        )}
        {showTickets && (
          <p className="mt-4 text-muted">Show one code per person at the gate. We&apos;ve also emailed these to {b.email}.</p>
        )}

        <ul className="mt-6 space-y-5">
          {b.tickets.map((t, i) => (
            <li key={t.seatLabel} className="ticket-stub">
              <div className="flex items-baseline gap-3 py-3">
                <span className="font-display text-2xl font-bold">{t.seatLabel}</span>
                <span className="text-muted">{t.tierName}</span>
                <span className="ml-auto tabular-nums">{formatInr(t.pricePaise)}</span>
              </div>
              {qrs[i] && (
                <div className="flex justify-center border-t border-dashed border-line pt-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrs[i]!} alt={`QR code for seat ${t.seatLabel}`} width={240} height={240} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
