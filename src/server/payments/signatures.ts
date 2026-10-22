import { createHmac, timingSafeEqual } from "node:crypto";

function hmacHex(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

function safeEqualHex(expectedHex: string, given: unknown): boolean {
  if (typeof given !== "string" || given.length === 0) return false;
  const a = Buffer.from(expectedHex);
  const b = Buffer.from(given);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Checkout callback: HMAC-SHA256 hex of `${orderId}|${paymentId}` keyed with the API key secret. */
export function verifyPaymentSignature(
  p: { orderId: string; paymentId: string; signature: string },
  keySecret: string,
): boolean {
  return safeEqualHex(hmacHex(keySecret, `${p.orderId}|${p.paymentId}`), p.signature);
}

/** Webhook: HMAC-SHA256 hex of the raw (unparsed) request body keyed with the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string, webhookSecret: string): boolean {
  return safeEqualHex(hmacHex(webhookSecret, rawBody), signature);
}
