import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getEmailSender } from "@/server/email/sender";
import { refundNoticeEmail, ticketCid, ticketsEmail } from "@/server/email/templates";
import { loadBookingWithTickets } from "@/server/tickets/loadBooking";
import { qrPng } from "@/server/tickets/qr";
import { qrPayload } from "@/server/tickets/tokens";

const MAX_ATTEMPTS = 5;

type Row = { id: string; booking_id: string; kind: "tickets" | "refund_notice"; attempts: number };

async function buildMessage(row: Row) {
  const b = await loadBookingWithTickets(row.booking_id);
  if (!b) throw new Error(`Booking ${row.booking_id} not found`);
  if (row.kind === "refund_notice") return { to: b.email, ...refundNoticeEmail(b) };
  const attachments = await Promise.all(
    b.tickets
      .filter((t) => t.token !== null)
      .map(async (t) => ({
        filename: `ticket-${t.seatLabel}.png`,
        content: await qrPng(qrPayload(t.token!)),
        contentId: ticketCid(t.seatLabel),
      })),
  );
  return { to: b.email, ...ticketsEmail(b), attachments };
}

/** Sends up to `limit` pending outbox emails; each row is locked (SKIP LOCKED) while it is sent. */
export async function processOutbox(limit = 20): Promise<{ sent: number; failed: number }> {
  const candidates = await db.execute<{ id: string }>(sql`
    SELECT id FROM email_outbox
     WHERE status = 'pending' AND attempts < ${MAX_ATTEMPTS}
     ORDER BY created_at, id
     LIMIT ${limit}`);
  let sent = 0;
  let failed = 0;
  for (const { id } of candidates.rows) {
    await db.transaction(async (tx) => {
      const { rows } = await tx.execute<Row>(sql`
        SELECT id, booking_id, kind, attempts FROM email_outbox
         WHERE id = ${id} AND status = 'pending' AND attempts < ${MAX_ATTEMPTS}
           FOR UPDATE SKIP LOCKED`);
      const row = rows[0];
      if (!row) return; // sent or locked by another worker
      try {
        await getEmailSender().send(await buildMessage(row));
        await tx.execute(sql`UPDATE email_outbox SET status = 'sent', sent_at = now() WHERE id = ${row.id}`);
        sent += 1;
      } catch (e) {
        const attempts = row.attempts + 1;
        const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
        await tx.execute(sql`
          UPDATE email_outbox
             SET attempts = ${attempts}, last_error = ${message},
                 status = ${attempts >= MAX_ATTEMPTS ? "failed" : "pending"}::outbox_status
           WHERE id = ${row.id}`);
        failed += 1;
      }
    });
  }
  return { sent, failed };
}
