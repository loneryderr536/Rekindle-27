import Razorpay from "razorpay";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { getFakeGateway } from "./fakeGateway";

type PaymentStatus = "created" | "authorized" | "captured" | "failed" | "refunded";
type RefundStatus = "pending" | "processed" | "failed";

export type GatewayRefund = { id: string; paymentId: string; amount: number; status: RefundStatus };

export interface PaymentGateway {
  createOrder(p: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<{ id: string }>;
  fetchOrderPayments(orderId: string): Promise<{ id: string; status: PaymentStatus; amount: number }[]>;
  refund(paymentId: string, amountPaise: number): Promise<{ id: string; status: string }>;
  /** Every refund created at or after `sinceUnixSec`, including ones made by hand in the Razorpay dashboard. */
  listRefunds(sinceUnixSec: number): Promise<GatewayRefund[]>;
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
  refunds: {
    all(params: { from: number; count: number; skip: number }): Promise<{
      items: { id: string; payment_id: string; amount: number | string; status: string }[];
    }>;
  };
}

const STATUSES: readonly string[] = ["created", "authorized", "captured", "failed", "refunded"];
const REFUND_STATUSES: readonly string[] = ["pending", "processed", "failed"];
/** Razorpay's maximum page size for list endpoints. */
const PAGE = 100;
/** Safety stop for listRefunds: 50 pages = 5,000 refunds, far beyond one event's lookback window. */
const MAX_PAGES = 50;

function unavailable(message: string, cause?: unknown): AppError {
  const e = new AppError("PAYMENT_UNAVAILABLE", message, 502);
  if (cause !== undefined) e.cause = cause;
  return e;
}

/**
 * Razorpay's own reason for a failed call, e.g. `HTTP 401 BAD_REQUEST_ERROR: Authentication failed`.
 * Built only from the status and Razorpay's `error` body, never from the request, so keys cannot leak.
 */
export function describeRazorpayError(e: unknown): string {
  const err = e as { statusCode?: unknown; error?: Record<string, unknown> };
  if (typeof err?.statusCode === "number") {
    const body = err.error ?? {};
    const text = (k: string) => (typeof body[k] === "string" && body[k] !== "NA" ? (body[k] as string) : null);
    const head = [`HTTP ${err.statusCode}`, text("code")].filter(Boolean).join(" ");
    const description = text("description");
    const extra = [text("reason") && `reason=${text("reason")}`, text("field") && `field=${text("field")}`]
      .filter(Boolean)
      .join(", ");
    return `${head}${description ? `: ${description}` : ""}${extra ? ` (${extra})` : ""}`;
  }
  // The SDK assumes an HTTP response; with none (offline, DNS, timeout) it fails reading `response.status`.
  if (e instanceof TypeError && /reading 'status'/.test(e.message)) return "no response from Razorpay (network problem or timeout)";
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}

async function wrap<T>(what: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AppError) throw e;
    const reason = describeRazorpayError(e);
    console.error(`Razorpay ${what} failed: ${reason}`);
    // The public message stays generic (routes send it to the browser); the reason rides in `cause` for logs.
    throw unavailable(`Razorpay ${what} failed`, new Error(reason));
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

  listRefunds(sinceUnixSec: number): Promise<GatewayRefund[]> {
    return wrap("refund listing", async () => {
      const out: GatewayRefund[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await this.client.refunds.all({ from: sinceUnixSec, count: PAGE, skip: page * PAGE });
        for (const r of res.items) {
          if (!REFUND_STATUSES.includes(r.status)) {
            throw unavailable(`Razorpay returned unexpected refund status "${r.status}"`);
          }
          out.push({ id: r.id, paymentId: r.payment_id, amount: Number(r.amount), status: r.status as RefundStatus });
        }
        if (res.items.length < PAGE) return out;
      }
      throw unavailable(`Razorpay refund listing exceeded ${MAX_PAGES * PAGE} refunds`);
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
