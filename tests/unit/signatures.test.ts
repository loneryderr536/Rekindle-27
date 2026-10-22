import { createHmac } from "node:crypto";
import { expect, test } from "vitest";
import { verifyPaymentSignature, verifyWebhookSignature } from "@/server/payments/signatures";

const secret = "test_secret";
const sig = createHmac("sha256", secret).update("order_1|pay_1").digest("hex");

test("valid payment signature", () =>
  expect(verifyPaymentSignature({ orderId: "order_1", paymentId: "pay_1", signature: sig }, secret)).toBe(true));
test("tampered payment id", () =>
  expect(verifyPaymentSignature({ orderId: "order_1", paymentId: "pay_2", signature: sig }, secret)).toBe(false));
test("tampered order id", () =>
  expect(verifyPaymentSignature({ orderId: "order_2", paymentId: "pay_1", signature: sig }, secret)).toBe(false));
test("wrong secret", () =>
  expect(verifyPaymentSignature({ orderId: "order_1", paymentId: "pay_1", signature: sig }, "other")).toBe(false));
test("short signature returns false", () =>
  expect(verifyPaymentSignature({ orderId: "order_1", paymentId: "pay_1", signature: "ab" }, secret)).toBe(false));
test("empty or non-string signature returns false without throwing", () => {
  expect(verifyPaymentSignature({ orderId: "order_1", paymentId: "pay_1", signature: "" }, secret)).toBe(false);
  expect(
    verifyPaymentSignature({ orderId: "order_1", paymentId: "pay_1", signature: undefined as unknown as string }, secret),
  ).toBe(false);
});

const body = '{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_1"}}}}';
const whSecret = "wh_secret";
const whSig = createHmac("sha256", whSecret).update(body).digest("hex");

test("webhook signature over raw body", () => expect(verifyWebhookSignature(body, whSig, whSecret)).toBe(true));
test("webhook: re-serialized JSON fails", () => {
  const respaced = JSON.stringify(JSON.parse(body), null, 2);
  expect(respaced).not.toBe(body);
  expect(verifyWebhookSignature(respaced, whSig, whSecret)).toBe(false);
});
test("webhook: wrong secret, short and empty signature return false", () => {
  expect(verifyWebhookSignature(body, whSig, "nope")).toBe(false);
  expect(verifyWebhookSignature(body, "abc", whSecret)).toBe(false);
  expect(verifyWebhookSignature(body, "", whSecret)).toBe(false);
});
