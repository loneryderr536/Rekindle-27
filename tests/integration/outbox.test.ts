import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test } from "vitest";
import { db } from "@/db/client";
import { bookings, emailOutbox } from "@/db/schema";
import { POST as postLookup } from "@/app/api/booking/lookup/route";
import { processOutbox } from "@/server/email/outbox";
import { setEmailSenderForTests } from "@/server/email/sender";
import { confirmBooking } from "@/server/payments/confirmBooking";
import { getBookingByAccessToken, loadBookingWithTickets } from "@/server/tickets/loadBooking";
import { seedVenue } from "../helpers/db";
import { FakeEmailSender } from "../helpers/fakes";
import { guest, holdWithOrder } from "../helpers/holds";

let sender: FakeEmailSender;

beforeEach(() => {
  sender = new FakeEmailSender();
  setEmailSenderForTests(sender);
});
afterEach(() => setEmailSenderForTests(null));

async function paidBooking(n = 2, who = guest) {
  const v = await seedVenue();
  const h = await holdWithOrder(v.seats.slice(0, n).map((s) => s.id), who);
  await confirmBooking({ orderId: h.orderId, paymentId: `pay_${h.orderId}`, amountPaise: h.amountPaise });
  return h;
}

async function outboxRow(bookingId: string) {
  const [r] = await db.select().from(emailOutbox).where(eq(emailOutbox.bookingId, bookingId));
  return r;
}

test("processOutbox sends tickets email with one QR attachment per seat", async () => {
  const h = await paidBooking(2);
  expect(await processOutbox()).toEqual({ sent: 1, failed: 0 });

  expect(sender.sent).toHaveLength(1);
  const m = sender.sent[0];
  expect(m.to).toBe(guest.email);
  expect(m.subject).toMatch(/^Your tickets – /);
  expect(m.attachments).toHaveLength(2);
  for (const a of m.attachments!) {
    expect(a.content.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(m.html).toContain(`cid:${a.contentId}`);
  }
  const row = await outboxRow(h.bookingId);
  expect(m.idempotencyKey).toBe(`outbox-${row.id}`);
  expect(row.status).toBe("sent");
  expect(row.sentAt).not.toBeNull();
  expect(await processOutbox()).toEqual({ sent: 0, failed: 0 });
  expect(sender.sent).toHaveLength(1);
});

test("send failure increments attempts; 5th failure marks failed", async () => {
  const h = await paidBooking(1);
  sender.failNext(5);
  for (let i = 1; i <= 4; i++) {
    expect(await processOutbox()).toEqual({ sent: 0, failed: 1 });
    const r = await outboxRow(h.bookingId);
    expect(r.attempts).toBe(i);
    expect(r.status).toBe("pending");
    expect(r.lastError).toContain("send failed");
  }
  expect(await processOutbox()).toEqual({ sent: 0, failed: 1 });
  const r = await outboxRow(h.bookingId);
  expect(r.attempts).toBe(5);
  expect(r.status).toBe("failed");
  expect(await processOutbox()).toEqual({ sent: 0, failed: 0 });
});

test("a failing row does not block later rows, and last_error is truncated", async () => {
  await paidBooking(1);
  const v = await seedVenue({ tiers: [{ name: "Bronze", pricePaise: 50000 }] });
  const h2 = await holdWithOrder([v.seats[0].id], { name: "B", email: "b@example.com", phone: "+919800000002" });
  await confirmBooking({ orderId: h2.orderId, paymentId: "pay_b", amountPaise: h2.amountPaise });
  sender.failNext(1);
  expect(await processOutbox()).toEqual({ sent: 1, failed: 1 });
  expect(sender.sent).toHaveLength(1);
});

test("last_error is truncated to 500 chars", async () => {
  const h = await paidBooking(1);
  sender.send = async () => {
    throw new Error("x".repeat(2000));
  };
  await processOutbox();
  expect((await outboxRow(h.bookingId)).lastError).toHaveLength(500);
});

test("two concurrent processOutbox runs send each email once", async () => {
  await paidBooking(1);
  const v = await seedVenue({ tiers: [{ name: "Bronze", pricePaise: 50000 }] });
  const h2 = await holdWithOrder([v.seats[0].id], { name: "B", email: "b@example.com", phone: "+919800000002" });
  await confirmBooking({ orderId: h2.orderId, paymentId: "pay_b", amountPaise: h2.amountPaise });
  sender.delayMs = 50;
  const [a, b] = await Promise.all([processOutbox(), processOutbox()]);
  expect(a.sent + b.sent).toBe(2);
  expect(sender.sent).toHaveLength(2);
  expect(new Set(sender.sent.map((m) => m.to)).size).toBe(2);
});

test("refund_notice email renders and sends", async () => {
  const h = await paidBooking(1);
  await db.update(bookings).set({ status: "refund_due", refundAmountPaise: h.amountPaise }).where(eq(bookings.id, h.bookingId));
  await db.insert(emailOutbox).values({ bookingId: h.bookingId, kind: "refund_notice" });
  await processOutbox();
  const m = sender.sent.find((x) => x.subject.startsWith("Refund for booking"))!;
  expect(m).toBeDefined();
  expect(m.attachments).toBeUndefined();
  expect(m.to).toBe(guest.email);
});

test("loadBookingWithTickets returns seats ordered by label with tokens; null for unknown", async () => {
  const h = await paidBooking(3);
  const b = (await loadBookingWithTickets(h.bookingId))!;
  expect(b.tickets.map((t) => t.seatLabel)).toEqual(["G-A-1", "G-A-2", "G-A-3"]);
  expect(b.tickets[0]).toMatchObject({ tierName: "Gold", pricePaise: 150000 });
  for (const t of b.tickets) expect(t.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect((await getBookingByAccessToken(b.accessToken))!.id).toBe(h.bookingId);
  expect(await getBookingByAccessToken("nope")).toBeNull();
  expect(await loadBookingWithTickets("00000000-0000-0000-0000-000000000000")).toBeNull();
});

test("loadBookingWithTickets for a pending booking has seats but no tokens", async () => {
  const v = await seedVenue();
  const h = await holdWithOrder([v.seats[0].id]);
  const b = (await loadBookingWithTickets(h.bookingId))!;
  expect(b.status).toBe("pending");
  expect(b.tickets).toEqual([{ seatLabel: "G-A-1", tierName: "Gold", pricePaise: 150000, token: null }]);
});

function lookup(body: unknown, ip = "9.9.9.9") {
  return postLookup(
    new Request("http://localhost/api/booking/lookup", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
  );
}

test("lookup finds booking case-insensitively; wrong email or code → identical 404", async () => {
  const h = await paidBooking(1);
  const b = (await loadBookingWithTickets(h.bookingId))!;
  const ok = await lookup({ publicCode: b.publicCode.toLowerCase(), email: `  ${guest.email.toUpperCase()} ` });
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({ accessToken: b.accessToken });

  const badEmail = await lookup({ publicCode: b.publicCode, email: "other@example.com" });
  const badCode = await lookup({ publicCode: "ZZZZZZ", email: guest.email });
  expect(badEmail.status).toBe(404);
  expect(badCode.status).toBe(404);
  expect(await badEmail.json()).toEqual(await badCode.json());
});

test("lookup validates input and is rate limited to 20 per IP", async () => {
  expect((await lookup({ publicCode: "" , email: "a@b.c" }, "7.7.7.7")).status).toBe(400);
  for (let i = 0; i < 19; i++) expect((await lookup({ publicCode: "AAAAAA", email: "a@b.c" }, "7.7.7.7")).status).toBe(404);
  const limited = await lookup({ publicCode: "AAAAAA", email: "a@b.c" }, "7.7.7.7");
  expect(limited.status).toBe(429);
  expect((await limited.json()).error.code).toBe("RATE_LIMITED");
});
