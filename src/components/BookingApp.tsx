"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckoutForm, type CheckoutDetails } from "@/components/CheckoutForm";
import { PageIntro, RegisterSteps } from "@/components/landing/BrandPage";
import { SeatMap } from "@/components/SeatMap";
import { clearHoldToken, readHoldToken, saveHoldToken } from "@/lib/activeHold";
import { clearAttendee, type Attendee } from "@/lib/attendee";
import { checkoutTimeoutSeconds, clockOffsetMs, formatCountdown, remainingMs } from "@/lib/countdown";
import { EVENT } from "@/lib/event";
import { holdErrorMessage } from "@/lib/holdErrors";
import { formatInr } from "@/lib/money";
import { savePendingPayment } from "@/lib/pendingPayment";
import { openRazorpayCheckout, type CheckoutHandle } from "@/lib/razorpayCheckout";
import type { SeatView, TierView } from "@/server/seats/listSeats";

const POLL_MS = 5000;

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

const EXPIRED_MESSAGE = "Your hold expired — pick your seats again";

type ApiError = { code: string; message: string; details?: { seatIds?: string[] } };
type Notice = { tone: "error" | "info"; text: string };

type SeatsData = { seats: SeatView[]; tiers: TierView[]; dateHeader: string | null };

async function fetchSeats(): Promise<SeatsData> {
  const res = await fetch("/api/seats", { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /api/seats ${res.status}`);
  const data = (await res.json()) as { seats: SeatView[]; tiers: TierView[] };
  return { ...data, dateHeader: res.headers.get("date") };
}

/**
 * Step 2 and 3 of registration: pick exactly as many seats as the attendee has participants,
 * then hold them and pay. `attendee` is null only while resuming a hold made earlier in this browser.
 */
export function BookingApp({ attendee }: { attendee: Attendee | null }) {
  const router = useRouter();
  const [seats, setSeats] = useState<SeatView[] | null>(null);
  const [tiers, setTiers] = useState<TierView[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [hold, setHold] = useState<Hold | null>(null);
  const [buyer, setBuyer] = useState<Omit<CheckoutDetails, "turnstileToken"> | null>(null);
  const [paying, setPaying] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const holdRef = useRef<Hold | null>(null);
  const selectedRef = useRef<string[]>([]);
  /** Clock offset from the latest /api/seats response; fallback when /api/holds has no Date header. */
  const seatsOffsetRef = useRef(0);
  const checkoutRef = useRef<CheckoutHandle | null>(null);
  useEffect(() => {
    holdRef.current = hold;
    selectedRef.current = selected;
  }, [hold, selected]);

  const applySeats = useCallback((data: SeatsData) => {
    if (data.dateHeader) seatsOffsetRef.current = clockOffsetMs(data.dateHeader, Date.now());
    setSeats(data.seats);
    setTiers(data.tiers);
    setLoadFailed(false);
    // Before a hold exists, drop any picked seat that someone else has since taken.
    if (holdRef.current) return;
    const open = new Set(data.seats.filter((s) => s.status === "available").map((s) => s.id));
    if (selectedRef.current.some((id) => !open.has(id))) {
      setSelected((cur) => cur.filter((id) => open.has(id)));
      setNotice({ tone: "error", text: holdErrorMessage("SEATS_TAKEN", "") });
    }
  }, []);

  const refresh = useCallback(() => {
    fetchSeats().then(applySeats, () => setLoadFailed(true));
  }, [applySeats]);

  // Poll the map every 5 s while the tab is visible; refresh as soon as it becomes visible again.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      clearInterval(timer);
      timer = setInterval(refresh, POLL_MS);
    };
    const onVisibility = () => {
      if (document.hidden) clearInterval(timer);
      else {
        refresh();
        start();
      }
    };
    refresh();
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  /** Forgets the hold on this page (close Checkout, back to picking seats) and shows `n`. */
  const dropHold = useCallback((n: Notice) => {
    checkoutRef.current?.close();
    checkoutRef.current = null;
    holdRef.current = null;
    clearHoldToken();
    setHold(null);
    setPaying(false);
    setSelected([]);
    setCheckoutOpen(false);
    setNotice(n);
    refresh();
  }, [refresh]);

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
        clockOffsetMs: dateHeader ? clockOffsetMs(dateHeader, sentAt) : seatsOffsetRef.current,
      };
      holdRef.current = h;
      setNow(Date.now());
      setHold(h);
      setBuyer({ name: body.name, email: body.email, phone: body.phone });
      setSelected([]);
      setNotice({ tone: "info", text: "Your seats are still on hold. Pay now, or release them to pick again." });
    })().catch(() => {
      // Offline: keep the token; the hold expires on its own if it is never resumed.
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Gives the held seats back so the guest (or anyone) can pick again. */
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
        dropHold({ tone: "info", text: "Your seats were released. Pick seats again whenever you're ready." });
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

  const seatById = useMemo(() => new Map((seats ?? []).map((s) => [s.id, s])), [seats]);
  const tierById = useMemo(() => new Map(tiers.map((t) => [t.id, t])), [tiers]);
  const selectedSeats = selected.map((id) => seatById.get(id)).filter((s): s is SeatView => Boolean(s));
  const total = selectedSeats.reduce((sum, s) => sum + (tierById.get(s.tierId)?.pricePaise ?? 0), 0);

  function toggle(id: string) {
    setNotice(null);
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

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
    setNotice(null);
    let res: Response;
    let sentAt = Date.now();
    try {
      res = await fetch("/api/holds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seatIds: selected, ...details }),
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
      if (err.code === "SEATS_TAKEN" || err.code === "INVALID_SEATS") {
        const taken = new Set(err.details?.seatIds ?? (err.code === "INVALID_SEATS" ? selected : []));
        setSelected((cur) => cur.filter((id) => !taken.has(id)));
        setCheckoutOpen(false);
        refresh();
      }
      return;
    }
    const dateHeader = res.headers.get("date");
    const h: Hold = {
      ...(body as Omit<Hold, "clockOffsetMs">),
      clockOffsetMs: dateHeader ? clockOffsetMs(dateHeader, sentAt) : seatsOffsetRef.current,
    };
    const who = { name: details.name, email: details.email, phone: details.phone };
    holdRef.current = h; // before the refresh below, so our own held seats aren't reported as taken
    saveHoldToken(h.accessToken);
    setNow(Date.now());
    setHold(h);
    setBuyer(who);
    setCheckoutOpen(false);
    refresh();
    await pay(h, who);
  }

  const wanted = attendee?.participants ?? 0;
  const picked = selected.length;

  const intro = (
    <div className="flex flex-col gap-6">
      <RegisterSteps current={hold ? 3 : 2} />
      <PageIntro
        eyebrow="ONE·26 · Registration"
        title={<>Pick your <span className="o26-hot">{wanted === 1 ? "seat" : "seats"}</span></>}
        lead={
          attendee ? (
            <>
              Choose {wanted === 1 ? "one seat" : `${wanted} seats`} for {attendee.name}&apos;s booking. Seats are held for 10
              minutes while you pay.
            </>
          ) : (
            "Your seats are on hold. Pay now, or release them to start again."
          )
        }
      />
    </div>
  );

  if (seats === null) {
    return (
      <section className="o26-wrap w-full px-6 pb-16 pt-[clamp(40px,6vw,72px)]">
        {intro}
        <p className="mt-8 text-muted" aria-live="polite">
          {loadFailed ? "Couldn't load the seat map. Check your connection; we'll keep trying." : "Loading seats…"}
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="o26-wrap w-full flex-1 px-6 pb-48 pt-[clamp(40px,6vw,72px)]">
        {intro}
        {loadFailed && (
          <p className="mt-3 text-sm text-muted" role="status">Seat availability may be out of date. Reconnecting…</p>
        )}
        <div className="mt-8">
          <SeatMap
            seats={seats}
            tiers={tiers}
            selected={hold ? [] : selected}
            onToggle={toggle}
            maxSelectable={hold || !attendee ? 0 : wanted}
            limitMessage={
              !attendee
                ? "Add your details first to pick seats."
                : `You're booking ${wanted === 1 ? "1 seat" : `${wanted} seats`}. Tap a picked seat to swap it, or change the number in your details.`
            }
          />
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 backdrop-blur">
        <div className="o26-wrap px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {notice && (
            <p role="alert" className={`mb-2 text-sm font-medium ${notice.tone === "error" ? "text-danger" : "text-ink"}`}>
              {notice.text}
            </p>
          )}
          {hold && remaining !== null ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-display m-0 text-xl font-semibold">
                  {hold.publicCode} &middot; <span className="tabular-nums">{formatInr(hold.amountPaise)}</span>
                </p>
                <p className="m-0 text-sm text-muted">
                  Seats held for <span className="font-semibold tabular-nums text-flame" aria-live="off">{formatCountdown(remaining)}</span>
                </p>
              </div>
              <button type="button" className="btn-ghost" disabled={paying || releasing} onClick={() => void releaseHold(hold)}>
                {releasing ? "Releasing…" : "Release seats"}
              </button>
              <button type="button" className="btn-primary" disabled={paying || releasing || !canPay} onClick={() => buyer && void pay(hold, buyer)}>
                {paying ? "Payment open…" : "Pay now"}
              </button>
            </div>
          ) : attendee ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-display m-0 text-xl font-semibold" aria-live="polite">
                  Picked {picked} of {wanted}
                </p>
                <p className="m-0 text-sm text-muted">
                  {picked === 0 ? (
                    "Tap a seat on the map to pick it."
                  ) : (
                    <>
                      {selectedSeats.map((x) => x.label).join(", ")} &middot; <span className="tabular-nums">{formatInr(total)}</span>
                    </>
                  )}
                </p>
              </div>
              <Link href="/register" className="btn-ghost">Edit details</Link>
              <button type="button" className="btn-primary" disabled={picked !== wanted} onClick={() => setCheckoutOpen(true)}>
                Continue
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <p className="m-0 flex-1 text-muted">Add your details to pick seats.</p>
              <Link href="/register" className="btn-primary">Your details</Link>
            </div>
          )}
        </div>
      </div>

      {checkoutOpen && !hold && attendee && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/60 sm:items-center" role="dialog"
          aria-modal="true" aria-labelledby="checkout-title"
          onKeyDown={(e) => e.key === "Escape" && setCheckoutOpen(false)}>
          <div className="sheet max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-paper p-6 sm:rounded-[28px]">
            <h2 id="checkout-title" className="font-display m-0 mb-4 text-3xl font-semibold">Confirm &amp; pay</h2>
            {notice?.tone === "error" && <p role="alert" className="mb-3 text-sm font-medium text-danger">{notice.text}</p>}
            <CheckoutForm selected={selectedSeats} tiers={tiers} attendee={attendee} onSubmit={submitDetails} onCancel={() => setCheckoutOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
