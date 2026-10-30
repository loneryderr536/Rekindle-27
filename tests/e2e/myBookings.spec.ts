import { expect, test } from "@playwright/test";
import { signInGuest } from "./helpers";

test("signed-out /my-bookings goes to sign-in and keeps the destination", async ({ page }) => {
  await page.goto("/my-bookings");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fmy-bookings$/);
});

test("signed-out /register/seats goes back to /register, which asks for sign-in", async ({ page }) => {
  await page.goto("/register/seats");
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole("heading", { name: "Sign in to book" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
});

test("signed-in /register shows the locked email", async ({ page }) => {
  await signInGuest(page, "locked.e2e@example.com", "Lock Ed");
  await page.goto("/register");
  const email = page.getByLabel("Email");
  await expect(email).toHaveValue("locked.e2e@example.com");
  await expect(email).toHaveAttribute("readonly", "");
});
