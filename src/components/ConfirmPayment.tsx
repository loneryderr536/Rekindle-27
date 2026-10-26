"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearPendingPayment, readPendingPayment } from "@/lib/pendingPayment";

/** Verifies the Checkout result with the server, then shows the booking page (for confirmed and pending alike). */
export function ConfirmPayment() {
  const router = useRouter();
  const [problem, setProblem] = useState<"missing" | "failed" | null>(null);

  useEffect(() => {
    const p = readPendingPayment();
    if (!p) {
      queueMicrotask(() => setProblem("missing"));
      return;
    }
    let cancelled = false;
    (async () => {
      let token = p.accessToken;
      try {
        const res = await fetch("/api/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            razorpay_order_id: p.razorpay_order_id,
            razorpay_payment_id: p.razorpay_payment_id,
            razorpay_signature: p.razorpay_signature,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as { accessToken?: string };
        if (res.ok && body.accessToken) token = body.accessToken;
      } catch {
        // The webhook confirms the payment anyway; the booking page shows the current status.
      }
      if (cancelled) return;
      clearPendingPayment();
      router.replace(`/booking/${encodeURIComponent(token)}`);
    })().catch(() => !cancelled && setProblem("failed"));
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (problem) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="font-display m-0 text-4xl font-semibold">We couldn&apos;t find a payment to confirm</h1>
        <p className="text-muted">
          If you paid, your tickets are on their way to your email. The email also links to your booking page.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/booking/find" className="btn-ghost inline-block">Find my booking</Link>
          <Link href="/register" className="btn-primary inline-block">Save your seat</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-center" aria-live="polite">
      <h1 className="font-display m-0 text-4xl font-semibold">Confirming your <span className="text-flame">payment</span></h1>
      <p className="text-muted">Keep this page open. Your tickets appear in a moment.</p>
    </div>
  );
}
