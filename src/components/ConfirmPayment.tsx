"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { clearPendingPayment, readPendingPayment } from "@/lib/pendingPayment";

const LOOP_MS = 5200;
/** Navy as the browser decodes the loader video (brand navy #0B1020 after H.264 rounding), so the clip blends into the panel. */
const LOADER_NAVY = "#0b1021";

/**
 * Verifies the Checkout result with the server, then shows the booking page (for confirmed and pending alike).
 * While it waits the burning logo plays; the redirect holds until the current loop ends on the finished logo.
 */
export function ConfirmPayment() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
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

  // Verified: leave when the loader video wraps back to its first frame (the assembled logo).
  useEffect(() => {
    if (!target) return;
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      router.replace(`/booking/${encodeURIComponent(target)}`);
    };
    const video = videoRef.current;
    if (!video || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      go();
      return;
    }
    let raf = 0;
    let last = video.currentTime;
    const tick = () => {
      const now = video.currentTime;
      if (now < last) return go();
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // If the video can't play (blocked autoplay, data saver), don't hold the tickets back.
    const safety = setTimeout(go, LOOP_MS + 1500);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(safety);
    };
  }, [target, router]);

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
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-2 px-6 text-center"
      style={{ background: LOADER_NAVY }}
      aria-live="polite"
    >
      <video
        ref={videoRef}
        className="aspect-square w-[min(80vw,52vh,520px)] motion-reduce:hidden"
        src="/landing/loader.mp4"
        poster="/landing/loader-poster.jpg"
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- still frame for reduced motion */}
      <img className="hidden aspect-square w-[min(80vw,52vh,520px)] motion-reduce:block" src="/landing/loader-poster.jpg" alt="" />
      <h1 className="font-display m-0 text-4xl font-semibold text-[#fdfbf4]">Confirming your <span className="text-flame">payment</span></h1>
      <p className="m-0 text-[#c9ccd8]">Keep this page open. Your tickets appear in a moment.</p>
    </div>
  );
}
