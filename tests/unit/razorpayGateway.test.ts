import { expect, test, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { describeRazorpayError, RazorpayGateway } from "@/server/payments/gateway";

function stub() {
  return {
    orders: {
      create: vi.fn().mockResolvedValue({ id: "order_9", amount: 50000 }),
      fetchPayments: vi.fn().mockResolvedValue({
        items: [
          { id: "pay_1", status: "captured", amount: 50000, extra: "x" },
          { id: "pay_2", status: "failed", amount: 50000 },
        ],
      }),
    },
    payments: { refund: vi.fn().mockResolvedValue({ id: "rfnd_1", status: "processed", amount: 100 }) },
    refunds: { all: vi.fn().mockResolvedValue({ items: [] }) },
  };
}

test("createOrder sends paise amount, INR, receipt and notes", async () => {
  const c = stub();
  const res = await new RazorpayGateway(c).createOrder({
    amountPaise: 50000,
    receipt: "bk_1",
    notes: { booking_id: "bk_1" },
  });
  expect(res).toEqual({ id: "order_9" });
  expect(c.orders.create).toHaveBeenCalledWith({
    amount: 50000,
    currency: "INR",
    receipt: "bk_1",
    notes: { booking_id: "bk_1" },
  });
});

test("fetchOrderPayments maps items to id/status/amount", async () => {
  const c = stub();
  const res = await new RazorpayGateway(c).fetchOrderPayments("order_9");
  expect(c.orders.fetchPayments).toHaveBeenCalledWith("order_9");
  expect(res).toEqual([
    { id: "pay_1", status: "captured", amount: 50000 },
    { id: "pay_2", status: "failed", amount: 50000 },
  ]);
});

test("fetchOrderPayments rejects an unexpected status", async () => {
  const c = stub();
  c.orders.fetchPayments.mockResolvedValue({ items: [{ id: "pay_3", status: "weird", amount: 1 }] });
  const err = await new RazorpayGateway(c).fetchOrderPayments("o").catch((e) => e);
  expect(err).toBeInstanceOf(AppError);
  expect(err).toMatchObject({ code: "PAYMENT_UNAVAILABLE", status: 502 });
  expect(err.message).toContain("weird");
});

test("refund sends paise amount with normal speed", async () => {
  const c = stub();
  const res = await new RazorpayGateway(c).refund("pay_1", 12345);
  expect(res).toEqual({ id: "rfnd_1", status: "processed" });
  expect(c.payments.refund).toHaveBeenCalledWith("pay_1", { amount: 12345, speed: "normal" });
});

test("SDK errors are wrapped as PAYMENT_UNAVAILABLE 502, logging Razorpay's reason", async () => {
  const boom = { statusCode: 401, error: { code: "BAD_REQUEST_ERROR", description: "Authentication failed" } };
  const c = stub();
  c.orders.create.mockRejectedValue(boom);
  c.orders.fetchPayments.mockRejectedValue(boom);
  c.payments.refund.mockRejectedValue(boom);
  const g = new RazorpayGateway(c);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const calls: [() => Promise<unknown>, string][] = [
      [() => g.createOrder({ amountPaise: 1, receipt: "r", notes: {} }), "order creation"],
      [() => g.fetchOrderPayments("o"), "payment lookup"],
      [() => g.refund("p", 1), "refund"],
    ];
    for (const [call, what] of calls) {
      const err = await call().catch((e) => e);
      expect(err).toBeInstanceOf(AppError);
      // The public message stays generic; the reason is in the log and in `cause`.
      expect(err).toMatchObject({ code: "PAYMENT_UNAVAILABLE", status: 502, message: `Razorpay ${what} failed` });
      expect((err as Error).cause).toEqual(new Error("HTTP 401 BAD_REQUEST_ERROR: Authentication failed"));
      expect(log).toHaveBeenLastCalledWith(`Razorpay ${what} failed: HTTP 401 BAD_REQUEST_ERROR: Authentication failed`);
    }
  } finally {
    log.mockRestore();
  }
});

test("describeRazorpayError: extra fields, placeholder NA, network failure, plain errors", () => {
  expect(describeRazorpayError({
    statusCode: 400,
    error: { code: "BAD_REQUEST_ERROR", description: "amount exceeds maximum", reason: "input_validation_failed", field: "amount", source: "NA" },
  })).toBe("HTTP 400 BAD_REQUEST_ERROR: amount exceeds maximum (reason=input_validation_failed, field=amount)");
  expect(describeRazorpayError({ statusCode: 500, error: { code: "SERVER_ERROR", description: "NA" } })).toBe("HTTP 500 SERVER_ERROR");
  expect(describeRazorpayError(new TypeError("Cannot read properties of undefined (reading 'status')"))).toBe(
    "no response from Razorpay (network problem or timeout)",
  );
  expect(describeRazorpayError(new Error("boom"))).toBe("Error: boom");
});

test("describeRazorpayError never includes request config such as the key secret", () => {
  const e = Object.assign(new Error("Request failed"), { config: { auth: { username: "rzp_test_x", password: "SECRET123" } } });
  expect(describeRazorpayError(e)).not.toContain("SECRET123");
  expect(describeRazorpayError({ statusCode: 401, error: {}, config: { auth: { password: "SECRET123" } } })).toBe("HTTP 401");
});

test("listRefunds pages through Razorpay's refund list from the given time", async () => {
  const c = stub();
  const page = (n: number, from: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `rfnd_${from + i}`, payment_id: `pay_${from + i}`, amount: "500", status: "processed" }));
  c.refunds.all.mockResolvedValueOnce({ items: page(100, 0) }).mockResolvedValueOnce({ items: page(3, 100) });
  const res = await new RazorpayGateway(c).listRefunds(1_700_000_000);
  expect(res).toHaveLength(103);
  expect(res[102]).toEqual({ id: "rfnd_102", paymentId: "pay_102", amount: 500, status: "processed" });
  expect(c.refunds.all).toHaveBeenNthCalledWith(1, { from: 1_700_000_000, count: 100, skip: 0 });
  expect(c.refunds.all).toHaveBeenNthCalledWith(2, { from: 1_700_000_000, count: 100, skip: 100 });
});

test("listRefunds rejects an unknown refund status", async () => {
  const c = stub();
  c.refunds.all.mockResolvedValue({ items: [{ id: "r", payment_id: "p", amount: 1, status: "weird" }] });
  await expect(new RazorpayGateway(c).listRefunds(0)).rejects.toMatchObject({ code: "PAYMENT_UNAVAILABLE" });
});
