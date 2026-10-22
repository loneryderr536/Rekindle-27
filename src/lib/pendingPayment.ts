import type { RazorpaySuccess } from "@/lib/razorpayCheckout";

export type PendingPayment = RazorpaySuccess & { accessToken: string };

const KEY = "pendingPayment";

/** Hands a completed Checkout result to /booking/success, which verifies it (survives a reload there). */
export function savePendingPayment(p: PendingPayment): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage unavailable: the success page falls back to the booking page via its error path.
  }
}

export function readPendingPayment(): PendingPayment | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingPayment) : null;
  } catch {
    return null;
  }
}

export function clearPendingPayment(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
