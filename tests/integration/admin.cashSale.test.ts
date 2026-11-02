import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test } from "vitest";
import { db } from "@/db/client";
import { adminUsers, bookingItems, bookings, emailOutbox, tickets } from "@/db/schema";
import type { Seat, Tier } from "@/db/schema";
import { POST as cashSaleRoute } from "@/app/api/admin/cash-sale/route";
import { issueCashSale } from "@/server/admin/seats";
import { createSession } from "@/server/auth/session";
import { setEmailSenderForTests } from "@/server/email/sender";
import { settleKickedOutbox } from "@/server/email/kickOutbox";
import { createHold } from "@/server/holds/createHold";
import { confirmBooking } from "@/server/payments/confirmBooking";
import { FakeEmailSender } from "../helpers/fakes";
import { guest, holdWithOrder, statusOf } from "../helpers/holds";
import { seedVenue } from "../helpers/db";

const ORIGIN = "http://localhost:3000";
const buyer = { name: "Door Sale", email: "Door@Example.com", phone: "98765 43210" };

let adminId: string;
let gold: Seat[];
let goldTier: Tier;

beforeEach(async () => {
  setEmailSenderForTests(new FakeEmailSender());
  const [u] = await db.insert(adminUsers).values({ email: "boss@example.com", role: "admin", passwordHash: "x" }).returning();
  adminId = u.id;
  const v = await seedVenue();
  [goldTier] = v.tiers;
  gold = v.seats.filter((s) => s.tierId === goldTier.id);
});

afterEach(async () => {
  await settleKickedOutbox();
  setEmailSenderForTests(null);
});

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    const err = e as { code?: string; status?: number; details?: { seatIds?: string[] } };
    return { code: err.code, status: err.status, seatIds: err.details?.seatIds };
  }
  throw new Error("expected rejection");
};

test("cash sale bills the seats' real tier prices and sells them", async () => {
  const r = await issueCashSale({ seatIds: [gold[0].id, gold[1].id], ...buyer }, adminId);
  expect(r.amountPaise).toBe(goldTier.pricePaise * 2);
  const [b] = await db.select().from(bookings).where(eq(bookings.id, r.bookingId));
  expect(b).toMatchObject({
    status: "paid", amountPaise: goldTier.pricePaise * 2, subtotalPaise: goldTier.pricePaise * 2,
    seatCount: 2, email: "door@example.com", phone: "+919876543210",
    publicCode: r.publicCode, accessToken: r.accessToken,
  });
  expect(b.paidAt).not.toBeNull();
  expect(await statusOf(gold[0].id)).toBe("sold");
  const items = await db.select().from(bookingItems).where(eq(bookingItems.bookingId, r.bookingId));
  expect(items.map((i) => [i.tierName, i.pricePaise])).toEqual([
    ["Gold", goldTier.pricePaise], ["Gold", goldTier.pricePaise],
  ]);
  expect(await db.select().from(tickets).where(eq(tickets.bookingId, r.bookingId))).toHaveLength(2);
  const outbox = await db.select().from(emailOutbox).where(eq(emailOutbox.bookingId, r.bookingId));
  expect(outbox).toMatchObject([{ kind: "tickets", status: "pending" }]);
});

test("cash sale is all-or-nothing when one seat is already sold", async () => {
  const b = await holdWithOrder([gold[1].id]);
  await confirmBooking({ orderId: b.orderId, paymentId: "pay_1", amountPaise: b.amountPaise });
  const res = await code(issueCashSale({ seatIds: [gold[0].id, gold[1].id], ...buyer }, adminId));
  expect(res).toMatchObject({ code: "SEATS_TAKEN", status: 409, seatIds: [gold[1].id] });
  expect(await statusOf(gold[0].id)).toBe("available");
  expect(await db.select().from(bookings).where(eq(bookings.status, "paid"))).toHaveLength(1); // only the online one
});

test("cash sale on a live held seat -> SEATS_TAKEN", async () => {
  await createHold({ seatIds: [gold[0].id], ...guest });
  expect(await code(issueCashSale({ seatIds: [gold[0].id], ...buyer }, adminId))).toMatchObject({ code: "SEATS_TAKEN" });
});

test("cash sale validation: bad phone, bad email, short name, duplicates", async () => {
  const ids = [gold[0].id];
  expect(await code(issueCashSale({ seatIds: ids, ...buyer, phone: "123" }, adminId))).toMatchObject({ code: "INVALID_PHONE", status: 400 });
  await expect(issueCashSale({ seatIds: ids, ...buyer, email: "nope" }, adminId)).rejects.toThrow();
  await expect(issueCashSale({ seatIds: ids, ...buyer, name: "A" }, adminId)).rejects.toThrow();
  await expect(issueCashSale({ seatIds: [gold[0].id, gold[0].id], ...buyer }, adminId)).rejects.toThrow();
  expect(await statusOf(gold[0].id)).toBe("available");
});

test("POST /api/admin/cash-sale requires an admin session", async () => {
  const res = await cashSaleRoute(
    new Request(`${ORIGIN}/api/admin/cash-sale`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ seatIds: [gold[0].id], ...buyer }),
    }),
  );
  expect(res.status).toBe(401);
});

test("POST /api/admin/cash-sale records the sale for a signed-in admin", async () => {
  const cookie = `admin_session=${await createSession(adminId)}`;
  const res = await cashSaleRoute(
    new Request(`${ORIGIN}/api/admin/cash-sale`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json", cookie },
      body: JSON.stringify({ seatIds: [gold[0].id], ...buyer }),
    }),
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { publicCode: string; amountPaise: number };
  expect(body.amountPaise).toBe(goldTier.pricePaise);
  expect(await statusOf(gold[0].id)).toBe("sold");
});
