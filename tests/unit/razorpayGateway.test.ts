import { expect, test, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { RazorpayGateway } from "@/server/payments/gateway";

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

test("SDK errors are wrapped as PAYMENT_UNAVAILABLE 502 with cause", async () => {
  const boom = { statusCode: 400, error: { description: "bad" } };
  const c = stub();
  c.orders.create.mockRejectedValue(boom);
  c.orders.fetchPayments.mockRejectedValue(boom);
  c.payments.refund.mockRejectedValue(boom);
  const g = new RazorpayGateway(c);
  for (const p of [
    g.createOrder({ amountPaise: 1, receipt: "r", notes: {} }),
    g.fetchOrderPayments("o"),
    g.refund("p", 1),
  ]) {
    const err = await p.catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: "PAYMENT_UNAVAILABLE", status: 502, cause: boom });
  }
});
