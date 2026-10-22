import { expect, test } from "vitest";
import { refundNoticeEmail, ticketsEmail } from "@/server/email/templates";
import type { BookingWithTickets } from "@/server/tickets/loadBooking";

const TOKEN = "T".repeat(43);

function booking(over: Partial<BookingWithTickets> = {}): BookingWithTickets {
  return {
    id: "b1", publicCode: "ABC123", accessToken: "acc_token_1", name: "Asha Rao", email: "asha@example.com",
    status: "paid", amountPaise: 230000, refundAmountPaise: null, seatCount: 2,
    tickets: [
      { seatLabel: "G-A-1", tierName: "Gold", pricePaise: 150000, token: TOKEN },
      { seatLabel: "S-A-1", tierName: "Silver", pricePaise: 80000, token: "U".repeat(43) },
    ],
    ...over,
  };
}

test("ticketsEmail contains booking link and seat labels, no QR token in text", () => {
  const { subject, html } = ticketsEmail(booking());
  expect(subject).toBe("Your tickets – ABC123");
  expect(html).toContain("http://localhost:3000/booking/acc_token_1");
  expect(html).toContain("G-A-1");
  expect(html).toContain("S-A-1");
  expect(html).toContain('<img src="cid:ticket-G-A-1"');
  expect(html).toContain('<img src="cid:ticket-S-A-1"');
  expect(html).toContain("₹2,300.00");
  expect(html).not.toContain(TOKEN);
  expect(html).not.toContain("RKT1");
});

test("ticketsEmail HTML-escapes the guest name", () => {
  const { html } = ticketsEmail(booking({ name: "<script>x</script>" }));
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
});

test("refundNoticeEmail has subject, escaped name and refund amount", () => {
  const { subject, html } = refundNoticeEmail(
    booking({ name: "<b>Eve</b>", status: "refund_due", refundAmountPaise: 150000 }),
  );
  expect(subject).toBe("Refund for booking ABC123");
  expect(html).toContain("₹1,500.00");
  expect(html).toContain("&lt;b&gt;Eve&lt;/b&gt;");
  expect(html).not.toContain("<b>Eve");
});
