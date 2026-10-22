import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { PaymentGateway } from "./gateway";

type Payment = Awaited<ReturnType<PaymentGateway["fetchOrderPayments"]>>[number];

/**
 * In-memory gateway for browser E2E (PAYMENT_GATEWAY=fake). Orders are numbered `order_fake_<n>`;
 * payments only exist once `POST /api/dev/fake-pay` reports them, and then count as captured.
 * Refuses to be created unless PAYMENT_GATEWAY=fake (and `parseEnv` refuses that in production).
 */
export class FakeAppGateway implements PaymentGateway {
  private orders = new Map<string, number>();
  private payments = new Map<string, Payment[]>();
  private orderCount = 0;
  private refundCount = 0;

  constructor() {
    if (env.PAYMENT_GATEWAY !== "fake") throw new Error("FakeAppGateway requires PAYMENT_GATEWAY=fake");
  }

  async createOrder(p: { amountPaise: number }): Promise<{ id: string }> {
    this.orderCount += 1;
    const id = `order_fake_${this.orderCount}`;
    this.orders.set(id, p.amountPaise);
    return { id };
  }

  /** Records a captured payment for the order, for the full order amount. */
  capture(orderId: string, paymentId: string): void {
    const amount = this.orders.get(orderId);
    if (amount === undefined) throw new AppError("UNKNOWN_ORDER", "Unknown order", 404);
    const list = this.payments.get(orderId) ?? [];
    if (!list.some((x) => x.id === paymentId)) list.push({ id: paymentId, status: "captured", amount });
    this.payments.set(orderId, list);
  }

  async fetchOrderPayments(orderId: string): Promise<Payment[]> {
    return this.payments.get(orderId) ?? [];
  }

  async refund(): Promise<{ id: string; status: string }> {
    this.refundCount += 1;
    return { id: `rfnd_fake_${this.refundCount}`, status: "processed" };
  }
}

const KEY = Symbol.for("event-booking.fakeGateway");

/** One instance per process: Next may bundle route handlers separately, so it hangs off globalThis. */
export function getFakeGateway(): FakeAppGateway {
  const g = globalThis as unknown as Record<symbol, FakeAppGateway | undefined>;
  return (g[KEY] ??= new FakeAppGateway());
}
