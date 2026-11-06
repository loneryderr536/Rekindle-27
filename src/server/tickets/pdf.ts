import { sql } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { db } from "@/db/client";
import { EVENT } from "@/lib/event";
import { getBookingByAccessToken, type BookingWithTickets } from "@/server/tickets/loadBooking";
import { qrPng } from "@/server/tickets/qr";
import { qrPayload } from "@/server/tickets/tokens";
import { ticketsVisible } from "@/server/tickets/visibility";

const INK = "#0B1020";
const MUTED = "#6b6b6b";

const inrFormatter = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", currencyDisplay: "code" });

/**
 * Amount in paise as rupees for PDF text, e.g. 150000 -> "INR 1,500.00". pdfkit's built-in Helvetica
 * (a standard 14 PDF font, not embedded) has no ₹ glyph — the symbol `formatInr` uses on the web
 * silently renders as a garbled superscript in a PDF, so the PDF path spells out the currency code.
 */
function inrForPdf(paise: number): string {
  return inrFormatter.format(paise / 100);
}

/**
 * Starts collecting a pdfkit document's output stream into one Buffer. Only wires up the listeners —
 * the caller must still write all its content and then call `doc.end()` once it is done; ending here
 * would close the document before an async content-building loop (e.g. one that awaits QR images) had
 * written anything past the first page.
 */
function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

/** Loads a booking ready for PDF rendering, or null if it doesn't exist or has no visible tickets yet. */
async function loadVisibleBooking(token: string): Promise<BookingWithTickets | null> {
  const b = await getBookingByAccessToken(token);
  return b && ticketsVisible(b.status) ? b : null;
}

/** One page per seat: event header, seat/tier, QR code, and gate instructions. */
export async function generateTicketPassPdf(token: string): Promise<Buffer | null> {
  const b = await loadVisibleBooking(token);
  if (!b) return null;

  const doc = new PDFDocument({ size: "A4", margin: 56 });
  const pending = collect(doc);

  for (let i = 0; i < b.tickets.length; i++) {
    const t = b.tickets[i];
    if (i > 0) doc.addPage();
    doc
      .fontSize(11).fillColor(MUTED).text(`ONE·26 · ${EVENT.name}`, { align: "center" })
      .moveDown(0.3)
      .fontSize(22).fillColor(INK).text(`ONE·26 ${EVENT.name}`, { align: "center" })
      .fontSize(12).fillColor(MUTED).text(`${EVENT.longDate} · ${EVENT.venue}, ${EVENT.hall}`, { align: "center" })
      .moveDown(1.5);

    const boxTop = doc.y;
    doc
      .roundedRect(doc.page.margins.left, boxTop, doc.page.width - doc.page.margins.left - doc.page.margins.right, 170, 10)
      .lineWidth(1).strokeColor("#E4DFD2").stroke();
    doc
      .fontSize(10).fillColor(MUTED).text("TICKET", doc.page.margins.left + 24, boxTop + 20)
      .fontSize(28).fillColor(INK).text(
        b.tickets.length > 1 ? `${i + 1} of ${b.tickets.length}` : "General admission",
        doc.page.margins.left + 24, boxTop + 34,
      )
      .fontSize(10).fillColor(MUTED).text("HOLDER", doc.page.margins.left + 24, boxTop + 104)
      .fontSize(14).fillColor(INK).text(b.name, doc.page.margins.left + 24, boxTop + 118)
      .fontSize(10).fillColor(MUTED).text(`Booking ${b.publicCode}`, doc.page.margins.left + 24, boxTop + 142);

    if (t.token) {
      const qr = await qrPng(qrPayload(t.token));
      doc.image(qr, doc.page.width - doc.page.margins.right - 150, boxTop + 15, { width: 140, height: 140 });
    }

    doc
      .moveDown(3)
      .fontSize(11).fillColor(MUTED).text(
        "Show this QR code at the gate — one per person. Gates open " + EVENT.gatesOpen + ".",
        { align: "center" },
      );
  }

  doc.end();
  return pending;
}

type InvoiceExtras = {
  phone: string; subtotalPaise: number | null; discountPaise: number; discountCode: string | null;
  razorpayPaymentId: string | null; createdAt: Date;
};

async function loadInvoiceExtras(bookingId: string): Promise<InvoiceExtras> {
  const { rows } = await db.execute<{
    phone: string; subtotal_paise: number | null; discount_paise: number; discount_code: string | null;
    razorpay_payment_id: string | null; created_at: Date;
  }>(sql`
    SELECT phone, subtotal_paise, discount_paise, discount_code, razorpay_payment_id, created_at
      FROM bookings WHERE id = ${bookingId}`);
  const r = rows[0];
  return {
    phone: r.phone, subtotalPaise: r.subtotal_paise, discountPaise: r.discount_paise,
    discountCode: r.discount_code, razorpayPaymentId: r.razorpay_payment_id, createdAt: new Date(r.created_at),
  };
}

/** A one-page payment receipt: bill-to, one line per seat, subtotal/discount/total, payment reference. */
export async function generateInvoicePdf(token: string): Promise<Buffer | null> {
  const b = await loadVisibleBooking(token);
  if (!b) return null;
  const extra = await loadInvoiceExtras(b.id);

  const doc = new PDFDocument({ size: "A4", margin: 56 });
  const pending = collect(doc);
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;

  doc
    .fontSize(20).fillColor(INK).text(`ONE·26 ${EVENT.name}`, left, doc.y)
    .fontSize(10).fillColor(MUTED).text("Payment receipt", left, doc.y)
    .moveUp(2)
    .fontSize(10).fillColor(MUTED).text(`Receipt ${b.publicCode}`, left, 56, { align: "right", width: right - left })
    .text(extra.createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }), { align: "right", width: right - left })
    .moveDown(2);

  doc
    .fontSize(10).fillColor(MUTED).text("BILLED TO", left)
    .fontSize(13).fillColor(INK).text(b.name)
    .fontSize(11).fillColor(MUTED).text(b.email)
    .text(extra.phone)
    .moveDown(1.5);

  const colItem = left, colLabel = left + 140, colAmount = right - 100;
  const tableTop = doc.y;
  doc
    .fontSize(10).fillColor(MUTED)
    .text("ITEM", colItem, tableTop)
    .text("AMOUNT", colAmount, tableTop, { width: right - colAmount, align: "right" });
  doc.moveTo(left, tableTop + 16).lineTo(right, tableTop + 16).strokeColor("#E4DFD2").stroke();

  let y = tableTop + 24;
  const count = b.tickets.length;
  b.tickets.forEach((t, i) => {
    doc
      .fontSize(11).fillColor(INK)
      .text(count > 1 ? `Ticket ${i + 1} of ${count}` : "General admission", colItem, y)
      .text(inrForPdf(t.pricePaise), colAmount, y, { width: right - colAmount, align: "right" });
    y += 20;
  });
  doc.moveTo(left, y + 4).lineTo(right, y + 4).strokeColor("#E4DFD2").stroke();
  y += 16;

  const totalsLine = (label: string, value: string, bold = false) => {
    doc.fontSize(bold ? 13 : 11).fillColor(bold ? INK : MUTED)
      .text(label, colLabel, y)
      .text(value, colAmount, y, { width: right - colAmount, align: "right" });
    y += bold ? 24 : 18;
  };
  if (extra.subtotalPaise !== null && extra.discountPaise > 0) {
    totalsLine("Subtotal", inrForPdf(extra.subtotalPaise));
    totalsLine(`Discount${extra.discountCode ? ` (${extra.discountCode})` : ""}`, `-${inrForPdf(extra.discountPaise)}`);
  }
  totalsLine("Total paid", inrForPdf(b.amountPaise), true);

  doc
    .fontSize(10).fillColor(MUTED)
    .text(
      extra.razorpayPaymentId ? `Payment reference: ${extra.razorpayPaymentId}` : "Paid in cash at the box office",
      left, y + 16,
    )
    .text("GSTIN: not registered", left);

  doc.end();
  return pending;
}
