import { CHECKOUT_TIMEOUT_S } from "@/lib/constants";

/** Formats a remaining duration as mm:ss, rounding up to the next whole second and clamping at 00:00. */
export function formatCountdown(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/** Checkout must close this long before the hold ends, so a payment can't complete at the boundary. */
export const CHECKOUT_MARGIN_MS = 30_000;

/** `serverNow - clientNow` from an HTTP `Date` header (second precision); 0 when the header is missing or unparsable. */
export function clockOffsetMs(dateHeader: string | null, clientNowMs: number): number {
  const server = dateHeader ? Date.parse(dateHeader) : NaN;
  return Number.isFinite(server) ? server - clientNowMs : 0;
}

/** Milliseconds left in a hold, measured on the server's clock (client time + offset). */
export function remainingMs(holdExpiresAt: string, clientNowMs: number, offsetMs: number): number {
  return Date.parse(holdExpiresAt) - (clientNowMs + offsetMs);
}

/**
 * Razorpay Checkout timeout for the time left in the hold: at most CHECKOUT_TIMEOUT_S, ending
 * CHECKOUT_MARGIN_MS before the hold does. Null when too little time is left to open Checkout.
 */
export function checkoutTimeoutSeconds(remaining: number): number | null {
  const s = Math.floor((remaining - CHECKOUT_MARGIN_MS) / 1000);
  return s >= 1 ? Math.min(CHECKOUT_TIMEOUT_S, s) : null;
}
