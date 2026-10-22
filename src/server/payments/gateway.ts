import Razorpay from "razorpay";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { getFakeGateway } from "./fakeGateway";

type PaymentStatus = "created" | "authorized" | "captured" | "failed" | "refunded";

export interface PaymentGateway {
  createOrder(p: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<{ id: string }>;
  fetchOrderPayments(orderId: string): Promise<{ id: string; status: PaymentStatus; amount: number }[]>;
  refund(paymentId: string, amountPaise: number): Promise<{ id: string; status: string }>;
}

/** The slice of the Razorpay SDK this gateway uses (injectable so tests need no network). */
export interface RazorpayClient {
  orders: {
    create(params: { amount: number; currency: string; receipt: string; notes: Record<string, string> }): Promise<{ id: string }>;
    fetchPayments(orderId: string): Promise<{ items: { id: string; status: string; amount: number | string }[] }>;
  };
  payments: {
    refund(paymentId: string, params: { amount: number; speed: "normal" }): Promise<{ id: string; status: string }>;
  };
}

const STATUSES: readonly string[] = ["created", "authorized", "captured", "failed", "refunded"];

function unavailable(message: string, cause?: unknown): AppError {
  const e = new AppError("PAYMENT_UNAVAILABLE", message, 502);
  if (cause !== undefined) e.cause = cause;
  return e;
}

async function wrap<T>(what: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw unavailable(`Razorpay ${what} failed`, e);
  }
}

export class RazorpayGateway implements PaymentGateway {
  private client: RazorpayClient;

  constructor(client?: RazorpayClient) {
    this.client = client ?? RazorpayGateway.defaultClient();
  }

  private static defaultClient(): RazorpayClient {
    let keyId: string | undefined;
    let keySecret: string | undefined;
    try {
      keyId = env.RAZORPAY_KEY_ID;
      keySecret = env.RAZORPAY_KEY_SECRET;
    } catch (e) {
      throw unavailable("Payment gateway not configured", e);
    }
    if (!keyId || !keySecret) throw unavailable("Payment gateway not configured");
    return new Razorpay({ key_id: keyId, key_secret: keySecret }) as unknown as RazorpayClient;
  }

  createOrder(p: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<{ id: string }> {
    return wrap("order creation", async () => {
      const order = await this.client.orders.create({
        amount: p.amountPaise,
        currency: "INR",
        receipt: p.receipt,
        notes: p.notes,
      });
      return { id: order.id };
    });
  }

  fetchOrderPayments(orderId: string): Promise<{ id: string; status: PaymentStatus; amount: number }[]> {
    return wrap("payment lookup", async () => {
      const res = await this.client.orders.fetchPayments(orderId);
      return res.items.map((i) => {
        if (!STATUSES.includes(i.status)) {
          throw unavailable(`Razorpay returned unexpected payment status "${i.status}"`);
        }
        return { id: i.id, status: i.status as PaymentStatus, amount: Number(i.amount) };
      });
    });
  }

  refund(paymentId: string, amountPaise: number): Promise<{ id: string; status: string }> {
    return wrap("refund", async () => {
      const r = await this.client.payments.refund(paymentId, { amount: amountPaise, speed: "normal" });
      return { id: r.id, status: r.status };
    });
  }
}

let override: PaymentGateway | null = null;
let singleton: PaymentGateway | null = null;

export function setGatewayForTests(g: PaymentGateway | null): void {
  override = g;
}

/** Test override if set; the in-memory fake when PAYMENT_GATEWAY=fake; otherwise a lazily created Razorpay singleton. */
export function getGateway(): PaymentGateway {
  if (override) return override;
  if (env.PAYMENT_GATEWAY === "fake") return getFakeGateway();
  return (singleton ??= new RazorpayGateway());
}
