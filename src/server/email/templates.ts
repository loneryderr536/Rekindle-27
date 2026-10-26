import { env } from "@/lib/env";
import { formatInr } from "@/lib/money";
import type { BookingWithTickets } from "@/server/tickets/loadBooking";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * Content ID of a ticket's inline QR image. Mail clients only match plain IDs, so any character
 * other than letters, digits, "." and "-" is written as _<hex>_ (distinct labels stay distinct).
 */
export function ticketCid(seatLabel: string): string {
  return `ticket-${seatLabel.replace(/[^A-Za-z0-9.-]/gu, (c) => `_${c.codePointAt(0)!.toString(16)}_`)}`;
}

export function ticketsEmail(b: BookingWithTickets): { subject: string; html: string } {
  const link = `${env.APP_URL}/booking/${b.accessToken}`;
  const blocks = b.tickets
    .map(
      (t) => `<div style="margin:16px 0">
<p style="margin:0 0 4px"><strong>Seat ${escapeHtml(t.seatLabel)}</strong> &middot; ${escapeHtml(t.tierName)} &middot; ${formatInr(t.pricePaise)}</p>
<img src="cid:${escapeHtml(ticketCid(t.seatLabel))}" alt="QR code for seat ${escapeHtml(t.seatLabel)}" width="200" height="200">
</div>`,
    )
    .join("\n");
  const html = `<!doctype html>
<html><body style="font-family:sans-serif">
<p>Hi ${escapeHtml(b.name)},</p>
<p>Your booking <strong>${escapeHtml(b.publicCode)}</strong> is confirmed. Total paid: ${formatInr(b.amountPaise)}.</p>
${blocks}
<p>Show the QR code for each seat at the gate. You can also view your tickets any time at
<a href="${escapeHtml(link)}">${escapeHtml(link)}</a>.</p>
</body></html>`;
  return { subject: `Your tickets – ${b.publicCode}`, html };
}

export function cancellationEmail(b: BookingWithTickets): { subject: string; html: string } {
  const html = `<!doctype html>
<html><body style="font-family:sans-serif">
<p>Hi ${escapeHtml(b.name)},</p>
<p>Your booking <strong>${escapeHtml(b.publicCode)}</strong> has been cancelled and its tickets are no longer valid.</p>
<p>If you think this is a mistake, please reply to this email.</p>
</body></html>`;
  return { subject: `Booking ${b.publicCode} cancelled`, html };
}

export function refundNoticeEmail(b: BookingWithTickets): { subject: string; html: string } {
  const amount = formatInr(b.refundAmountPaise ?? b.amountPaise);
  const code = `<strong>${escapeHtml(b.publicCode)}</strong>`;
  // paidAt is set only for a booking that was confirmed and later cancelled.
  const reason = b.paidAt
    ? `Your booking ${code} has been cancelled and its tickets are no longer valid. Your payment is being refunded.`
    : `We could not confirm your seats for booking ${code}, so your payment is being refunded.`;
  const html = `<!doctype html>
<html><body style="font-family:sans-serif">
<p>Hi ${escapeHtml(b.name)},</p>
<p>${reason}</p>
<p>Refund amount: <strong>${amount}</strong>. It should reach your original payment method within 5&ndash;7 working days.</p>
</body></html>`;
  return { subject: `Refund for booking ${b.publicCode}`, html };
}
