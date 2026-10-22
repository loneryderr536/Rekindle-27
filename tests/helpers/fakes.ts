import type { EmailSender } from "@/server/email/sender";
import type { PaymentGateway } from "@/server/payments/gateway";

type Payment = Awaited<ReturnType<PaymentGateway["fetchOrderPayments"]>>[number];

/** In-memory PaymentGateway for tests; records calls and can be told to fail. */
export class FakeGateway implements PaymentGateway {
  orders: { amountPaise: number; receipt: string; notes: Record<string, string>; id: string }[] = [];
  refunds: { paymentId: string; amountPaise: number; id: string }[] = [];
  private payments = new Map<string, Payment[]>();
  private orderCount = 0;
  private refundCount = 0;
  private failOrder = false;
  private failRefund = false;

  failNextCreateOrder(): void {
    this.failOrder = true;
  }

  failNextRefund(): void {
    this.failRefund = true;
  }

  setPayments(orderId: string, payments: Payment[]): void {
    this.payments.set(orderId, payments);
  }

  async createOrder(p: { amountPaise: number; receipt: string; notes: Record<string, string> }) {
    if (this.failOrder) {
      this.failOrder = false;
      throw new Error("FakeGateway: createOrder failed");
    }
    this.orderCount += 1;
    const id = `order_test_${this.orderCount}`;
    this.orders.push({ ...p, id });
    return { id };
  }

  async fetchOrderPayments(orderId: string) {
    return this.payments.get(orderId) ?? [];
  }

  async refund(paymentId: string, amountPaise: number) {
    if (this.failRefund) {
      this.failRefund = false;
      throw new Error("FakeGateway: refund failed");
    }
    this.refundCount += 1;
    const id = `rfnd_test_${this.refundCount}`;
    this.refunds.push({ paymentId, amountPaise, id });
    return { id, status: "processed" };
  }
}


type SentMessage = Parameters<EmailSender["send"]>[0];

/** In-memory EmailSender for tests; records messages and can be told to fail. */
export class FakeEmailSender implements EmailSender {
  sent: SentMessage[] = [];
  delayMs = 0;
  private failures = 0;

  failNext(n = 1): void {
    this.failures = n;
  }

  async send(m: SentMessage): Promise<void> {
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error("FakeEmailSender: send failed");
    }
    this.sent.push(m);
  }
}
