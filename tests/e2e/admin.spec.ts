import { expect, test } from "@playwright/test";
import { ADMIN, login, SCANNER, seatButton, startBooking } from "./helpers";

test("admin blocks seat; public map shows it unavailable", async ({ browser, baseURL }) => {
  const adminCtx = await browser.newContext({ baseURL });
  const admin = await adminCtx.newPage();

  await admin.goto("/admin/login");
  await admin.getByLabel("Email").fill(ADMIN.email);
  await admin.getByLabel("Password").fill(ADMIN.password);
  await admin.getByRole("button", { name: "Sign in" }).click();
  await admin.waitForURL(/\/admin$/);

  await admin.goto("/admin/seats");
  await seatButton(admin, "S-A-1", "Silver").click();
  await admin.getByRole("button", { name: "Block", exact: true }).click();
  await expect(admin.getByRole("status").filter({ hasText: "Blocked 1" })).toBeVisible();

  // A guest with no session sees it greyed out and cannot pick it.
  const guestCtx = await browser.newContext({ baseURL });
  const guest = await guestCtx.newPage();
  await startBooking(guest, { name: "Guest Viewer", email: "viewer.e2e@example.com", phone: "9876543219" }, 1);
  const seat = seatButton(guest, "S-A-1", "Silver", "blocked");
  await expect(seat).toBeVisible();
  await expect(seat).toHaveAttribute("aria-disabled", "true");
  await seat.click({ force: true });
  await expect(guest.getByText("Picked 0 of 1")).toBeVisible();

  await guestCtx.close();
  await adminCtx.close();
});

test("scanner role cannot open /admin", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL });
  const page = await ctx.newPage();
  await login(page, SCANNER, baseURL!);

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login\?denied=1/);
  await expect(page.getByText("Your account can't open that page.")).toBeVisible();

  const api = await page.request.get("/api/admin/export");
  expect(api.status()).toBe(403);

  await ctx.close();
});
