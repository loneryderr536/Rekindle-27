"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { LoadingScreen } from "@/components/landing/LoadingScreen";
import { clearPendingPayment, readPendingPayment } from "@/lib/pendingPayment";

const LOOP_MS = 5200;

/**
 * Verifies the Checkout result with the server, then shows the booking page (for confirmed and pending alike).
 * While it waits the fire-vortex loading screen plays; the redirect holds until the logo has settled and is burning.
 */
export function ConfirmPayment() {
  const router = useRouter();
  const [problem, setProblem] = useState<"missing" | "failed" | null>(null);
  const [target, setTarget] = useState<string | null>(null);

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
      setTarget(token);
    })().catch(() => !cancelled && setProblem("failed"));
    return () => {
      cancelled = true;
    };
  }, []);

  const leave = useCallback(() => {
    if (target) router.replace(`/booking/${encodeURIComponent(target)}`);
  }, [target, router]);

  // Verified: leave when the logo has settled (LoadingScreen calls back). Without motion, or if the
  // animation can't run, don't hold the tickets back.
  useEffect(() => {
    if (!target) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      leave();
      return;
    }
    const safety = setTimeout(leave, LOOP_MS + 1500);
    return () => clearTimeout(safety);
  }, [target, leave]);

  if (problem) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center space-y-4 px-6 text-center">
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

  return <LoadingScreen note="Confirming your payment. Keep this page open." done={target !== null} onSettled={leave} />;
}
