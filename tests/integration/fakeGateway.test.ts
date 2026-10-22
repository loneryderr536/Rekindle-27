import { afterEach, beforeEach, expect, test } from "vitest";
import { POST as fakePay } from "@/app/api/dev/fake-pay/route";
import { resetEnvForTests } from "@/lib/env";
import { getGateway } from "@/server/payments/gateway";

function setMode(mode: string | undefined) {
  if (mode === undefined) delete process.env.PAYMENT_GATEWAY;
  else process.env.PAYMENT_GATEWAY = mode;
  resetEnvForTests();
}

beforeEach(() => setMode(undefined));
afterEach(() => setMode(undefined));

const post = (body: unknown) =>
  fakePay(new Request("http://localhost/api/dev/fake-pay", { method: "POST", body: JSON.stringify(body) }));

test("dev route is 404 unless PAYMENT_GATEWAY=fake", async () => {
  const res = await post({ orderId: "order_fake_1", paymentId: "pay_1" });
  expect(res.status).toBe(404);
});

test("default getGateway is not the fake", () => {
  expect(getGateway().constructor.name).toBe("RazorpayGateway");
});

test("fake mode: orders are numbered and only reported payments are captured", async () => {
  setMode("fake");
  const gw = getGateway();
  const order = await gw.createOrder({ amountPaise: 230000, receipt: "r", notes: {} });
  expect(order.id).toMatch(/^order_fake_\d+$/);
  expect(await gw.fetchOrderPayments(order.id)).toEqual([]);

  const res = await post({ orderId: order.id, paymentId: "pay_fake_1" });
  expect(res.status).toBe(200);
  expect(await gw.fetchOrderPayments(order.id)).toEqual([{ id: "pay_fake_1", status: "captured", amount: 230000 }]);
});

test("fake mode: unknown order is 404 and bad body is 400", async () => {
  setMode("fake");
  expect((await post({ orderId: "nope", paymentId: "p" })).status).toBe(404);
  expect((await post({})).status).toBe(400);
});

test("fake gateway cannot be built in production even if selected", async () => {
  setMode("fake");
  const prev = process.env.NODE_ENV;
  const prevSecret = process.env.TURNSTILE_SECRET;
  Object.assign(process.env, { NODE_ENV: "production", TURNSTILE_SECRET: "real" });
  resetEnvForTests();
  try {
    expect(() => getGateway()).toThrow(/PAYMENT_GATEWAY/);
  } finally {
    Object.assign(process.env, { NODE_ENV: prev, TURNSTILE_SECRET: prevSecret });
  }
});
