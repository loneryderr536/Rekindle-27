import { env } from "@/lib/env";
import { formatInr } from "@/lib/money";
import type { BookingWithTickets } from "@/server/tickets/loadBooking";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Content ID of a ticket's inline QR image. */
export function ticketCid(seatLabel: string): string {
  return `ticket-${seatLabel}`;
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

export function refundNoticeEmail(b: BookingWithTickets): { subject: string; html: string } {
  const amount = formatInr(b.refundAmountPaise ?? b.amountPaise);
  const html = `<!doctype html>
<html><body style="font-family:sans-serif">
<p>Hi ${escapeHtml(b.name)},</p>
<p>We could not confirm your seats for booking <strong>${escapeHtml(b.publicCode)}</strong>, so your payment is being refunded.</p>
<p>Refund amount: <strong>${amount}</strong>. It should reach your original payment method within 5&ndash;7 working days.</p>
</body></html>`;
  return { subject: `Refund for booking ${b.publicCode}`, html };
}
