import { eq } from "drizzle-orm";
import { afterEach, expect, test } from "vitest";
import { db } from "@/db/client";
import { bookings, emailOutbox } from "@/db/schema";
import { POST as postResend } from "@/app/api/my-bookings/[id]/resend/route";
import { listGuestBookings } from "@/server/bookings/listGuestBookings";
import { settleKickedOutbox } from "@/server/email/kickOutbox";
import { createHold } from "@/server/holds/createHold";
import { setGuestForTests } from "@/server/guestAuth/getGuest";
import { seedVenue } from "../helpers/db";
import { guest, guestIdFor, guestN } from "../helpers/holds";

afterEach(async () => {
  setGuestForTests(null);
  await settleKickedOutbox();
});

async function booking(
  seatIds: string[],
  who: { name: string; email: string; phone: string },
  patch: Partial<typeof bookings.$inferInsert> = {},
) {
  const h = await createHold({ seatIds, ...who });
  if (Object.keys(patch).length > 0) await db.update(bookings).set(patch).where(eq(bookings.id, h.bookingId));
  return h.bookingId;
}

function signIn(email: string) {
  setGuestForTests({ guest: { userId: guestIdFor(email), email, name: null } });
}

function resend(id: string, headers: Record<string, string> = {}) {
  return postResend(
    new Request(`http://localhost/api/my-bookings/${id}/resend`, {
      method: "POST",
      headers: { origin: process.env.APP_URL!, ...headers },
    }),
    { params: Promise.resolve({ id }) } as never,
  );
}

const outboxCount = async (id: string) =>
  (await db.select().from(emailOutbox).where(eq(emailOutbox.bookingId, id))).length;

test("listGuestBookings matches mixed-case emails, filters, orders newest first, carries seats", async () => {
  const { seats } = await seedVenue();
  const past = new Date(Date.now() - 60_000);
  const future = new Date(Date.now() + 600_000);
  const paid = await booking([seats[1].id, seats[0].id], { ...guest, email: "x@example.com" }, {
    status: "paid", email: "Asha@Example.com ", createdAt: new Date(Date.now() - 3000),
  });
  const refunded = await booking([seats[2].id], guestN(1), {
    status: "refunded", email: "asha@example.com", createdAt: new Date(Date.now() - 2000),
  });
  const active = await booking([seats[3].id], guestN(2), {
    status: "pending", email: "ASHA@example.com", holdExpiresAt: future, createdAt: new Date(Date.now() - 1000),
  });
  await booking([seats[4].id], guestN(3), { status: "pending", email: "asha@example.com", holdExpiresAt: past });
  await booking([seats[5].id], guestN(4), { status: "expired", email: "asha@example.com" });
  await booking([seats[6].id], guestN(5), { status: "paid", email: "other@example.com" });

  const list = await listGuestBookings("asha@example.com");
  expect(list.map((b) => b.id)).toEqual([active, refunded, paid]);
  const p = list[2];
  expect(p.seats).toEqual(
    [seats[0], seats[1]]
      .map((s) => ({ label: s.label, tierName: "Gold" }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  );
  expect(p).toMatchObject({ status: "paid", amountPaise: 300000 });
  expect(typeof p.accessToken).toBe("string");
  expect(typeof p.publicCode).toBe("string");
});

test("resend: owner gets 200 and one new tickets outbox row; email case/padding ignored", async () => {
  const { seats } = await seedVenue();
  const id = await booking([seats[0].id], guest, { status: "paid", email: " Asha@Example.com " });
  signIn("asha@example.com");
  const res = await resend(id);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(await outboxCount(id)).toBe(1);
});

test("resend: comp is allowed", async () => {
  const { seats } = await seedVenue();
  const id = await booking([seats[0].id], guest, { status: "comp" });
  signIn(guest.email);
  expect((await resend(id)).status).toBe(200);
});

test("resend: another guest gets 404", async () => {
  const { seats } = await seedVenue();
  const id = await booking([seats[0].id], guest, { status: "paid" });
  signIn("other@example.com");
  expect((await resend(id)).status).toBe(404);
  expect(await outboxCount(id)).toBe(0);
});

test("resend: pending booking gets 409 NOT_RESENDABLE", async () => {
  const { seats } = await seedVenue();
  const id = await booking([seats[0].id], guest);
  signIn(guest.email);
  const res = await resend(id);
  expect(res.status).toBe(409);
  expect((await res.json()).error.code).toBe("NOT_RESENDABLE");
});

test("resend: unsigned gets 401 SIGN_IN_REQUIRED", async () => {
  const { seats } = await seedVenue();
  const id = await booking([seats[0].id], guest, { status: "paid" });
  const res = await resend(id);
  expect(res.status).toBe(401);
  expect((await res.json()).error.code).toBe("SIGN_IN_REQUIRED");
});

test("resend: wrong Origin gets 403", async () => {
  const { seats } = await seedVenue();
  const id = await booking([seats[0].id], guest, { status: "paid" });
  signIn(guest.email);
  expect((await resend(id, { origin: "https://evil.example" })).status).toBe(403);
});

test("resend: 4th call within the hour gets 429; failures and non-owners do not use the quota", async () => {
  const { seats } = await seedVenue();
  const id = await booking([seats[0].id], guest, { status: "paid" });
  signIn("other@example.com");
  for (let i = 0; i < 5; i++) expect((await resend(id)).status).toBe(404);
  signIn(guest.email);
  for (let i = 0; i < 3; i++) expect((await resend(id)).status).toBe(200);
  const res = await resend(id);
  expect(res.status).toBe(429);
  expect(await outboxCount(id)).toBe(3);
});
