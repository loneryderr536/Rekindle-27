export type RazorpaySuccess = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

export type CheckoutOptions = {
  keyId: string;
  orderId: string;
  amountPaise: number;
  name: string;
  email: string;
  phone: string;
  description?: string;
  /** Seconds until Checkout times out; the caller caps this to the time left in the hold. */
  timeoutSeconds: number;
  onSuccess: (r: RazorpaySuccess) => void;
  onDismiss: () => void;
};

type RazorpayInstance = { open: () => void; close: () => void; on: (event: string, cb: (r: unknown) => void) => void };
type RazorpayCtor = new (opts: Record<string, unknown>) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayCtor;
  }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
export const THEME_COLOR = "#4A1942";

let script: Promise<RazorpayCtor> | null = null;

/** Loads Razorpay's checkout.js once per page; a failed load can be retried. */
export function loadRazorpay(): Promise<RazorpayCtor> {
  script ??= new Promise<RazorpayCtor>((resolve, reject) => {
    if (window.Razorpay) return resolve(window.Razorpay);
    const s = document.createElement("script");
    s.src = CHECKOUT_SRC;
    s.async = true;
    s.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Razorpay missing")));
    s.onerror = () => {
      script = null;
      s.remove();
      reject(new Error("Razorpay Checkout failed to load"));
    };
    document.head.appendChild(s);
  });
  return script;
}

export type CheckoutHandle = { close: () => void };

/**
 * Opens Razorpay Checkout for an order created by the server and returns a handle that closes it.
 * The amount is display-only; Razorpay charges the order's amount.
 */
export async function openRazorpayCheckout(opts: CheckoutOptions): Promise<CheckoutHandle> {
  const Razorpay = await loadRazorpay();
  const rzp = new Razorpay({
    key: opts.keyId,
    order_id: opts.orderId,
    amount: opts.amountPaise,
    currency: "INR",
    name: opts.description ?? "Tickets",
    timeout: opts.timeoutSeconds,
    prefill: { name: opts.name, email: opts.email, contact: opts.phone },
    theme: { color: THEME_COLOR },
    handler: (r: RazorpaySuccess) => opts.onSuccess(r),
    modal: { ondismiss: () => opts.onDismiss(), confirm_close: true },
  });
  rzp.open();
  return {
    close: () => {
      try {
        rzp.close();
      } catch {
        // Already closed.
      }
    },
  };
}
