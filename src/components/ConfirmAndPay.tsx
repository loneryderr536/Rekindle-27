"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckoutForm, type CheckoutDetails } from "@/components/CheckoutForm";
import { PageIntro, RegisterSteps } from "@/components/landing/BrandPage";
import { clearHoldToken, readHoldToken, saveHoldToken } from "@/lib/activeHold";
import { clearAttendee, type Attendee } from "@/lib/attendee";
import { checkoutTimeoutSeconds, clockOffsetMs, formatCountdown, remainingMs } from "@/lib/countdown";
import { EVENT } from "@/lib/event";
import { holdErrorMessage } from "@/lib/holdErrors";
import { formatInr } from "@/lib/money";
import { savePendingPayment } from "@/lib/pendingPayment";
import { openRazorpayCheckout, type CheckoutHandle } from "@/lib/razorpayCheckout";

type Hold = {
  bookingId: string;
  publicCode: string;
  accessToken: string;
  amountPaise: number;
  holdExpiresAt: string;
  razorpayOrderId: string;
  razorpayKeyId: string;
  /** serverNow - clientNow, so the countdown runs on the server's clock even if the device clock is off. */
  clockOffsetMs: number;
};

const EXPIRED_MESSAGE = "Your hold expired — start again";

type ApiError = { code: string; message: string };
type Notice = { tone: "error" | "info"; text: string };

/** `data` is null on a 304 (nothing changed since `etag`); the caller keeps its existing price. */
async function fetchPricing(): Promise<{ pricePaise: number; dateHeader: string | null }> {
  const res = await fetch("/api/pricing", { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /api/pricing ${res.status}`);
  const data = (await res.json()) as { pricePaise: number };
  return { ...data, dateHeader: res.headers.get("date") };
}

/**
 * Step 2 of registration: confirm the order (seat count and total from /register) and pay.
 * `attendee` is null only while resuming a hold made earlier in this browser.
 */
export function ConfirmAndPay({ attendee }: { attendee: Attendee | null }) {
  const router = useRouter();
  const [pricePaise, setPricePaise] = useState<number | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [hold, setHold] = useState<Hold | null>(null);
  const [buyer, setBuyer] = useState<Omit<CheckoutDetails, "turnstileToken"> | null>(null);
  const [paying, setPaying] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const holdRef = useRef<Hold | null>(null);
  /** Clock offset from the pricing response; fallback when /api/holds has no Date header. */
  const priceOffsetRef = useRef(0);
  const checkoutRef = useRef<CheckoutHandle | null>(null);
  useEffect(() => {
    holdRef.current = hold;
  }, [hold]);

  useEffect(() => {
    let cancelled = false;
    fetchPricing().then(({ pricePaise: p, dateHeader }) => {
      if (cancelled) return;
      if (dateHeader) priceOffsetRef.current = clockOffsetMs(dateHeader, Date.now());
      setPricePaise(p);
      setLoadFailed(false);
    }, () => !cancelled && setLoadFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  /** Forgets the hold on this page (back to /register) and shows `n`. */
  const dropHold = useCallback((n: Notice) => {
    checkoutRef.current?.close();
    checkoutRef.current = null;
    holdRef.current = null;
    clearHoldToken();
    clearAttendee();
    setHold(null);
    setPaying(false);
    setNotice(n);
    router.push("/register");
  }, [router]);

  /** The hold is over (or too close to its end to pay): start over. */
  const expireHold = useCallback(() => dropHold({ tone: "error", text: EXPIRED_MESSAGE }), [dropHold]);

  // After a reload, pick up a hold this browser made earlier so the guest can still pay for it or release it.
  useEffect(() => {
    const token = readHoldToken();
    if (!token) return;
    let cancelled = false;
    (async () => {
      const sentAt = Date.now();
      const res = await fetch("/api/holds/current", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: token }),
      });
      if (cancelled) return;
      if (!res.ok) {
        if (res.status === 404) clearHoldToken();
        return;
      }
      const body = (await res.json()) as Omit<Hold, "clockOffsetMs"> & { name: string; email: string; phone: string };
      if (cancelled || holdRef.current) return;
      const dateHeader = res.headers.get("date");
      const h: Hold = {
        bookingId: body.bookingId,
        publicCode: body.publicCode,
        accessToken: body.accessToken,
        amountPaise: body.amountPaise,
        holdExpiresAt: body.holdExpiresAt,
        razorpayOrderId: body.razorpayOrderId,
        razorpayKeyId: body.razorpayKeyId,
        clockOffsetMs: dateHeader ? clockOffsetMs(dateHeader, sentAt) : priceOffsetRef.current,
      };
      holdRef.current = h;
      setNow(Date.now());
      setHold(h);
      setBuyer({ name: body.name, email: body.email, phone: body.phone });
      setNotice({ tone: "info", text: "Your seats are still on hold. Pay now, or release them to start again." });
    })().catch(() => {
      // Offline: keep the token; the hold expires on its own if it is never resumed.
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Gives the held seats back so the guest can book again. */
  async function releaseHold(h: Hold) {
    setReleasing(true);
    try {
      const res = await fetch("/api/holds/current", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: h.accessToken }),
      });
      if (!res.ok) throw new Error(`DELETE /api/holds/current ${res.status}`);
      if (holdRef.current?.bookingId === h.bookingId) {
        dropHold({ tone: "info", text: "Your seats were released. Start again whenever you're ready." });
      }
    } catch {
      setNotice({ tone: "error", text: "Couldn't release your seats. Check your connection and try again." });
    } finally {
      setReleasing(false);
    }
  }

  // Hold countdown on the server's clock; at zero the hold is gone and the attendee starts over.
  useEffect(() => {
    if (!hold) return;
    const t = setInterval(() => {
      const at = Date.now();
      setNow(at);
      if (remainingMs(hold.holdExpiresAt, at, hold.clockOffsetMs) > 0) return;
      clearInterval(t);
      expireHold();
    }, 1000);
    return () => clearInterval(t);
  }, [hold, expireHold]);
  const remaining = hold ? remainingMs(hold.holdExpiresAt, now, hold.clockOffsetMs) : null;
  const canPay = remaining !== null && checkoutTimeoutSeconds(remaining) !== null;

  const pay = useCallback(
    async (h: Hold, who: Omit<CheckoutDetails, "turnstileToken">) => {
      // Checkout must time out 30 s before the hold does; with less time left it isn't opened at all.
      const timeoutSeconds = checkoutTimeoutSeconds(remainingMs(h.holdExpiresAt, Date.now(), h.clockOffsetMs));
      if (timeoutSeconds === null) {
        expireHold();
        return;
      }
      setPaying(true);
      try {
        const handle = await openRazorpayCheckout({
          timeoutSeconds,
          keyId: h.razorpayKeyId,
          orderId: h.razorpayOrderId,
          amountPaise: h.amountPaise,
          name: who.name,
          email: who.email,
          phone: who.phone,
          description: EVENT.name,
          onSuccess: (r) => {
            checkoutRef.current = null;
            clearHoldToken();
            clearAttendee();
            savePendingPayment({ ...r, accessToken: h.accessToken });
            router.push("/booking/success");
          },
          onDismiss: () => {
            checkoutRef.current = null;
            if (holdRef.current?.bookingId === h.bookingId) setPaying(false);
          },
        });
        // The hold may have ended while checkout.js was loading.
        if (holdRef.current?.bookingId === h.bookingId) checkoutRef.current = handle;
        else handle.close();
      } catch {
        setPaying(false);
        setNotice({ tone: "error", text: "The payment window didn't load. Check your connection, then tap Pay now." });
      }
    },
    [router, expireHold],
  );

  async function submitDetails(details: CheckoutDetails) {
    if (!attendee) return;
    setNotice(null);
    let res: Response;
    let sentAt = Date.now();
    try {
      res = await fetch("/api/holds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seatCount: attendee.participants, ...details }),
      });
      sentAt = Date.now();
    } catch {
      setNotice({ tone: "error", text: holdErrorMessage("NETWORK", "") });
      return;
    }
    const body = (await res.json().catch(() => ({}))) as Partial<Hold> & { error?: ApiError };
    if (!res.ok || !body.razorpayOrderId) {
      const err = body.error ?? { code: "internal_error", message: "" };
      setNotice({ tone: "error", text: holdErrorMessage(err.code, err.message) });
      return;
    }
    const dateHeader = res.headers.get("date");
    const h: Hold = {
      ...(body as Omit<Hold, "clockOffsetMs">),
      clockOffsetMs: dateHeader ? clockOffsetMs(dateHeader, sentAt) : priceOffsetRef.current,
    };
    const who = { name: details.name, email: details.email, phone: details.phone };
    holdRef.current = h;
    saveHoldToken(h.accessToken);
    setNow(Date.now());
    setHold(h);
    setBuyer(who);
    await pay(h, who);
  }

  const intro = (
    <div className="flex flex-col gap-6">
      <RegisterSteps current={2} />
      <PageIntro
        eyebrow="ONE·26 · Registration"
        title="Confirm & pay"
        lead={
          attendee ? (
            <>Review your order for {attendee.name}&apos;s booking, then pay to confirm. Your spot is held for 10 minutes.</>
          ) : (
            "Your booking is on hold. Pay now, or release it to start again."
          )
        }
      />
    </div>
  );

  if (pricePaise === null && !hold) {
    return (
      <section className="o26-wrap w-full px-6 pb-16 pt-[clamp(40px,6vw,72px)]">
        {intro}
        <p className="mt-8 text-muted" aria-live="polite">
          {loadFailed ? "Couldn't load pricing. Check your connection; we'll keep trying." : "Loading…"}
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="o26-wrap w-full flex-1 px-6 pb-48 pt-[clamp(40px,6vw,72px)]">
        {intro}
        {notice && !hold && (
          <p role="alert" className={`mt-4 text-sm font-medium ${notice.tone === "error" ? "text-danger" : ""}`}>
            {notice.text}
          </p>
        )}
        {!hold && attendee && pricePaise !== null && (
          <div className="sheet mt-8 max-w-md rounded-[28px] bg-paper p-6">
            <CheckoutForm seatCount={attendee.participants} pricePaise={pricePaise} attendee={attendee} onSubmit={submitDetails} />
          </div>
        )}
      </section>

      {hold && remaining !== null && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#FDFBF4]/15 bg-[#0B1020]/90 text-[#FDFBF4] backdrop-blur">
          <div className="o26-wrap px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {notice && (
              <p role="alert" className={`mb-2 text-sm font-medium ${notice.tone === "error" ? "text-[#FFB4A8]" : "text-[#FDFBF4]"}`}>
                {notice.text}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-display m-0 text-xl font-semibold">
                  {hold.publicCode} &middot; <span className="tabular-nums">{formatInr(hold.amountPaise)}</span>
                </p>
                <p className="m-0 text-sm text-muted">
                  Held for <span className="font-semibold tabular-nums text-flame" aria-live="off">{formatCountdown(remaining)}</span>
                </p>
              </div>
              <button type="button" className="btn-ghost" disabled={paying || releasing} onClick={() => void releaseHold(hold)}>
                {releasing ? "Releasing…" : "Release seats"}
              </button>
              <button type="button" className="btn-primary" disabled={paying || releasing || !canPay} onClick={() => buyer && void pay(hold, buyer)}>
                {paying ? "Payment open…" : "Pay now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
