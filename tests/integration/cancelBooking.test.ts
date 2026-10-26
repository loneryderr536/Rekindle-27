import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, test } from "vitest";
import { db } from "@/db/client";
import { adminUsers, auditLog, bookings, tickets } from "@/db/schema";
import { POST as cancelRoute } from "@/app/api/admin/bookings/[id]/cancel/route";
import { createSession } from "@/server/auth/session";
import { settleKickedOutbox } from "@/server/email/kickOutbox";
import { setEmailSenderForTests } from "@/server/email/sender";
import { createHold } from "@/server/holds/createHold";
import { issueComp } from "@/server/admin/seats";
import { cancelBooking } from "@/server/payments/cancelBooking";
import { confirmBooking } from "@/server/payments/confirmBooking";
import { setGatewayForTests } from "@/server/payments/gateway";
import { processRefunds } from "@/server/payments/refunds";
import { scanTicket } from "@/server/scan/scanTicket";
import { FakeEmailSender, FakeGateway } from "../helpers/fakes";
import { seedVenue } from "../helpers/db";
import { guestN, holdWithOrder, statusOf } from "../helpers/holds";

const ORIGIN = "http://localhost:3000";

let adminId: string;
let gateway: FakeGateway;

beforeEach(async () => {
  gateway = new FakeGateway();
  setGatewayForTests(gateway);
  setEmailSenderForTests(new FakeEmailSender());
  const [u] = await db.insert(adminUsers).values({ email: "boss@example.com", role: "admin", passwordHash: "x" }).returning();
  adminId = u.id;
});

afterEach(async () => {
  await settleKickedOutbox();
  setGatewayForTests(null);
  setEmailSenderForTests(null);
});

async function paidBooking() {
  const { seats } = await seedVenue();
  const seatIds = [seats[0].id, seats[1].id];
  const h = await holdWithOrder(seatIds);
  expect(await confirmBooking({ orderId: h.orderId, paymentId: "pay_c1", amountPaise: h.amountPaise })).toBe("confirmed");
  return { ...h, seatIds, allSeats: seats };
}

const bookingOf = async (id: string) => (await db.select().from(bookings).where(eq(bookings.id, id)))[0];

function cancel(id: string, cookie?: string) {
  return cancelRoute(
    new Request(`${ORIGIN}/api/admin/bookings/${id}/cancel`, {
      method: "POST",
      headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) },
    }),
    { params: Promise.resolve({ id }) },
  );
}

test("cancelBooking frees seats, voids tickets and parks the full amount as refund_due", async () => {
  const h = await paidBooking();
  const [t] = await db.select().from(tickets).where(eq(tickets.bookingId, h.bookingId));
  expect(await cancelBooking(h.bookingId, adminId)).toBe("refund_due");

  const b = await bookingOf(h.bookingId);
  expect(b.status).toBe("refund_due");
  expect(b.refundAmountPaise).toBe(h.amountPaise);
  for (const id of h.seatIds) expect(await statusOf(id)).toBe("available");
  expect(await db.select().from(tickets).where(eq(tickets.bookingId, h.bookingId))).toHaveLength(0);
  expect(await scanTicket({ token: t.token, adminUserId: adminId, gate: "A" })).toEqual({ result: "invalid" });
  const { rows } = await db.execute<{ status: string }>(
    sql`SELECT status FROM email_outbox WHERE booking_id = ${h.bookingId} AND kind = 'tickets'`,
  );
  expect(rows.map((r) => r.status)).toEqual(["failed"]);
  expect((await db.select().from(auditLog)).map((a) => a.action)).toEqual(["cancel_booking"]);

  expect(await processRefunds(gateway)).toEqual({ refunded: 1, failed: 0 });
  expect(gateway.refunds).toEqual([{ paymentId: "pay_c1", amountPaise: h.amountPaise, id: "rfnd_test_1" }]);
  expect((await bookingOf(h.bookingId)).status).toBe("refunded");
});

test("freed seats can be booked again after a cancel", async () => {
  const h = await paidBooking();
  await cancelBooking(h.bookingId, adminId);
  const again = await createHold({ seatIds: h.seatIds, ...guestN(7) });
  const orderId = "order_again";
  await db.update(bookings).set({ razorpayOrderId: orderId }).where(eq(bookings.id, again.bookingId));
  expect(await confirmBooking({ orderId, paymentId: "pay_c2", amountPaise: again.amountPaise })).toBe("confirmed");
});

test("cancel is refused for unpaid and already-scanned bookings", async () => {
  const h = await paidBooking();
  const [t] = await db.select().from(tickets).where(eq(tickets.bookingId, h.bookingId));
  await scanTicket({ token: t.token, adminUserId: adminId, gate: "A" });
  await expect(cancelBooking(h.bookingId, adminId)).rejects.toMatchObject({ code: "ALREADY_CHECKED_IN", status: 409 });
  expect((await bookingOf(h.bookingId)).status).toBe("paid");

  const pending = await createHold({ seatIds: [h.allSeats[5].id], ...guestN(3) });
  await expect(cancelBooking(pending.bookingId, adminId)).rejects.toMatchObject({ code: "NOT_CANCELLABLE" });
});

test("POST cancel refunds at once; admin only", async () => {
  const h = await paidBooking();
  const [scanner] = await db.insert(adminUsers).values({ email: "gate@example.com", role: "scanner", passwordHash: "x" }).returning();
  expect((await cancel(h.bookingId)).status).toBe(401);
  expect((await cancel(h.bookingId, `admin_session=${await createSession(scanner.id)}`)).status).toBe(403);

  const res = await cancel(h.bookingId, `admin_session=${await createSession(adminId)}`);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, status: "refunded" });
  expect((await bookingOf(h.bookingId)).status).toBe("refunded");
});

test("POST cancel with Razorpay down leaves refund_due for the reconcile cron", async () => {
  const h = await paidBooking();
  gateway.failNextRefund();
  const res = await cancel(h.bookingId, `admin_session=${await createSession(adminId)}`);
  expect(await res.json()).toEqual({ ok: true, status: "refund_due" });
  expect((await bookingOf(h.bookingId)).status).toBe("refund_due");
});

test("cancelling a comp voids its tickets, frees its seats and emails the guest, with no refund", async () => {
  const { seats } = await seedVenue();
  const c = await issueComp({ seatIds: [seats[0].id], name: "VIP Guest", email: "vip@example.com", phone: "9876543210" }, adminId);
  const [t] = await db.select().from(tickets).where(eq(tickets.bookingId, c.bookingId));

  const res = await cancel(c.bookingId, `admin_session=${await createSession(adminId)}`);
  expect(await res.json()).toEqual({ ok: true, status: "cancelled" });
  expect((await bookingOf(c.bookingId)).status).toBe("cancelled");
  expect(await statusOf(seats[0].id)).toBe("available");
  expect(await scanTicket({ token: t.token, adminUserId: adminId, gate: "A" })).toEqual({ result: "invalid" });
  expect(gateway.refunds).toHaveLength(0);
  const { rows } = await db.execute<{ kind: string; status: string }>(
    sql`SELECT kind, status FROM email_outbox WHERE booking_id = ${c.bookingId} ORDER BY created_at`,
  );
  expect(rows.map((r) => r.kind)).toEqual(["tickets", "cancellation"]);
  expect(rows[0].status).toBe("failed");
  expect((await db.select().from(auditLog)).map((a) => a.action)).toContain("cancel_comp");
});
