import { createHmac, randomBytes } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";
import pg from "pg";
import type { BrowserContext, Page } from "@playwright/test";

config({ path: path.resolve(import.meta.dirname, "../../.env.test"), override: true, quiet: true });

export const ADMIN = { email: "admin@example.com", password: "admin-password-123", role: "admin" } as const;
export const SCANNER = { email: "gate@example.com", password: "scanner-password-123", role: "scanner" } as const;

/** Seeded by global-setup: Gold G-A-1..6 (Rs 1,500) and Silver S-A-1..6 (Rs 800). */
export const seatButton = (page: Page, label: string, tier: string, status = "available") =>
  page.getByRole("button", { name: `${label}, ${tier}, ${status}` });

/** Runs one query against booking_test. */
export async function query<T extends object>(sqlText: string, params: unknown[] = []): Promise<T[]> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    return (await pool.query<T>(sqlText, params)).rows;
  } finally {
    await pool.end();
  }
}

/**
 * Replaces Razorpay's checkout.js with a stub whose "Pay" completes instantly: it reports the payment to the
 * app's fake gateway and hands the page a correctly signed result. With `pay: false` the window opens and does nothing.
 */
export async function stubRazorpay(context: BrowserContext, opts: { pay: boolean; baseURL: string }): Promise<void> {
  await context.route("https://checkout.razorpay.com/v1/checkout.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
        window.Razorpay = function (opts) { this.opts = opts; };
        window.Razorpay.prototype.open = function () {
          var o = this.opts;
          if (!window.__rzpPay) return;
          window.__rzpPay(o.order_id).then(function (r) { o.handler(r); });
        };
        window.Razorpay.prototype.close = function () {};
        window.Razorpay.prototype.on = function () {};`,
    }),
  );
  if (!opts.pay) return;
  await context.exposeFunction("__rzpPay", async (orderId: string) => {
    const paymentId = `pay_e2e_${randomBytes(6).toString("hex")}`;
    const res = await fetch(`${opts.baseURL}/api/dev/fake-pay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId, paymentId }),
    });
    if (!res.ok) throw new Error(`fake-pay failed: ${res.status}`);
    const sig = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!).update(`${orderId}|${paymentId}`).digest("hex");
    return { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sig };
  });
}

/** Fills the checkout sheet (after "Continue") and submits it. */
export async function fillDetails(page: Page, who: { name: string; email: string; phone: string }): Promise<void> {
  await page.getByLabel("Full name").fill(who.name);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Mobile number").fill(who.phone);
  await page.getByRole("button", { name: /^Pay / }).click();
}

/** Signs in through the API so the context carries the session cookie. */
export async function login(page: Page, user: { email: string; password: string }, baseURL: string): Promise<void> {
  const res = await page.request.post("/api/admin/login", {
    headers: { origin: new URL(baseURL).origin },
    data: { email: user.email, password: user.password },
  });
  if (!res.ok()) throw new Error(`login failed for ${user.email}: ${res.status()}`);
}
