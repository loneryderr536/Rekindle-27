import { expect, test } from "@playwright/test";
import { confirmAndPay, login, query, SCANNER, seatButton, startBooking, stubRazorpay } from "./helpers";

test("guest books 2 seats, pays, sees QR, gate scan green then red", async ({ browser, baseURL }) => {
  const guestCtx = await browser.newContext({ baseURL });
  await stubRazorpay(guestCtx, { pay: true, baseURL: baseURL! });
  const page = await guestCtx.newPage();

  await startBooking(page, { name: "Asha Rao", email: "asha.e2e@example.com", phone: "9876543210" }, 2);
  await expect(page.getByText("Picked 0 of 2")).toBeVisible();
  await seatButton(page, "G-A-1", "Gold").click();
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  await seatButton(page, "G-A-2", "Gold").click();
  // Two participants means two seats: a third pick is refused.
  await seatButton(page, "G-A-3", "Gold").click();
  await expect(page.getByText(/You're booking 2 seats/)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByTestId("checkout-total")).toContainText("3,000");
  await expect(page.getByRole("dialog").getByText("asha.e2e@example.com")).toBeVisible();
  await confirmAndPay(page);

  // Stubbed Checkout pays at once; the app verifies the signature and lands on the booking page.
  await page.waitForURL(/\/booking\/(?!success)[^/]+$/, { timeout: 30_000 });
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("img", { name: /^QR code for seat / })).toHaveCount(2);
  const code = (await page.getByRole("heading", { level: 1 }).innerText()).replace("Booking", "").trim();
  expect(code).not.toBe("");

  // The tickets email is queued (the running app cannot reach a real mail provider; its content is covered by integration tests).
  const outbox = await query<{ kind: string }>(
    `SELECT o.kind FROM email_outbox o JOIN bookings b ON b.id = o.booking_id WHERE b.public_code = $1`,
    [code],
  );
  expect(outbox.map((r) => r.kind)).toEqual(["tickets"]);

  // Gate: manual check-in shows the green screen, and the same ticket scanned again is rejected.
  const gateCtx = await browser.newContext({ baseURL });
  const gate = await gateCtx.newPage();
  await login(gate, SCANNER, baseURL!);
  await gate.goto("/scan");
  await gate.getByLabel("Gate name").fill("Gate A");
  await gate.getByLabel("Booking code or phone").fill(code);
  await gate.getByRole("button", { name: "Search" }).click();
  await gate.getByRole("button", { name: "Check in" }).first().click();
  const flash = gate.getByRole("alert").filter({ hasText: "Gold" });
  await expect(flash).toBeVisible();
  await expect(flash).toHaveClass(/bg-green-700/);
  await expect(flash).toContainText(/G-A-[12]/);
  await expect(flash).toContainText("Asha");

  const [ticket] = await query<{ token: string }>(
    `SELECT t.token FROM tickets t JOIN bookings b ON b.id = t.booking_id
      WHERE b.public_code = $1 AND t.checked_in_at IS NOT NULL`,
    [code],
  );
  const again = await gate.request.post("/api/scan", {
    headers: { origin: new URL(baseURL!).origin },
    data: { payload: `RKT1:${ticket.token}`, gate: "Gate A" },
  });
  expect((await again.json()).result).toBe("already");

  await gateCtx.close();
  await guestCtx.close();
});

test("two browsers race for the same seat: one succeeds, other sees 'seat just taken'", async ({ browser, baseURL }) => {
  const SEAT = "G-A-5";

  const ctxA = await browser.newContext({ baseURL });
  await stubRazorpay(ctxA, { pay: false, baseURL: baseURL! }); // A holds the seat and leaves Checkout open
  const a = await ctxA.newPage();

  const ctxB = await browser.newContext({ baseURL });
  await stubRazorpay(ctxB, { pay: false, baseURL: baseURL! });
  const b = await ctxB.newPage();
  // Freeze B's seat map as it is now, so B still offers the seat after A has taken it.
  const snapshot = await (await b.request.get("/api/seats")).text();
  await b.route("**/api/seats", (route) => route.fulfill({ contentType: "application/json", body: snapshot }));

  await startBooking(a, { name: "Racer One", email: "racer1.e2e@example.com", phone: "9876543211" }, 1);
  await startBooking(b, { name: "Racer Two", email: "racer2.e2e@example.com", phone: "9876543212" }, 1);
  for (const p of [a, b]) {
    await seatButton(p, SEAT, "Gold").click();
    await p.getByRole("button", { name: "Continue" }).click();
  }

  await confirmAndPay(a);
  await expect(a.getByText(/Seats held for/)).toBeVisible();

  await confirmAndPay(b);
  await expect(b.getByText(/seats were just taken/i)).toBeVisible();

  const held = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM booking_items bi JOIN seats s ON s.id = bi.seat_id WHERE s.label = $1`,
    [SEAT],
  );
  expect(held[0].n).toBe(1);

  await ctxA.close();
  await ctxB.close();
});
