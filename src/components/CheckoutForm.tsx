"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Attendee } from "@/lib/attendee";
import { discountAmountPaise } from "@/lib/discount";
import { formatInr } from "@/lib/money";
import type { SeatView, TierView } from "@/server/seats/listSeats";

export type CheckoutDetails = { name: string; email: string; phone: string; turnstileToken: string; discountCode?: string };

type Props = {
  selected: SeatView[];
  tiers: TierView[];
  /** Entered on /register; this form only confirms it. */
  attendee: Omit<Attendee, "participants">;
  onSubmit: (details: CheckoutDetails) => Promise<void>;
  onCancel?: () => void;
};

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
/** With the dev/test site key no widget is rendered; the server's test secret accepts this token. */
const TEST_TOKEN = "test-pass";

let turnstileScript: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  turnstileScript ??= new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = TURNSTILE_SRC;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile missing")));
    s.onerror = () => {
      turnstileScript = null;
      reject(new Error("Turnstile failed to load"));
    };
    document.head.appendChild(s);
  });
  return turnstileScript;
}

/** The last step before Razorpay: the attendee's details, the picked seats and total, and the bot check. */
export function CheckoutForm({ selected, tiers, attendee, onSubmit, onCancel }: Props) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  const testMode = siteKey === "test";
  const [token, setToken] = useState<string>(testMode ? TEST_TOKEN : "");
  const [busy, setBusy] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [applied, setApplied] = useState<{ code: string; percent: number } | null>(null);
  const [codeError, setCodeError] = useState("");
  const [checkingCode, setCheckingCode] = useState(false);
  const [widgetError, setWidgetError] = useState(siteKey === "");
  const widgetEl = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (testMode || !siteKey || !widgetEl.current) return;
    let cancelled = false;
    const el = widgetEl.current;
    loadTurnstile()
      .then((ts) => {
        if (cancelled) return;
        widgetId.current = ts.render(el, {
          sitekey: siteKey,
          callback: (t: string) => setToken(t),
          "expired-callback": () => setToken(""),
          "error-callback": () => setToken(""),
        });
      })
      .catch(() => !cancelled && setWidgetError(true));
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, testMode]);

  const tierById = new Map(tiers.map((t) => [t.id, t]));
  const subtotal = selected.reduce((sum, s) => sum + (tierById.get(s.tierId)?.pricePaise ?? 0), 0);
  const discount = applied ? discountAmountPaise(subtotal, applied.percent) : 0;
  const total = subtotal - discount;
  const codePending = codeInput.trim() !== "" && !applied;

  async function applyCode() {
    if (!codeInput.trim() || checkingCode) return;
    setCheckingCode(true);
    setCodeError("");
    try {
      const res = await fetch("/api/discount/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeInput }),
      });
      const body = (await res.json().catch(() => ({}))) as { code?: string; percent?: number; error?: { code: string } };
      if (res.ok && body.code && body.percent) {
        setApplied({ code: body.code, percent: body.percent });
      } else if (body.error?.code === "RATE_LIMITED") {
        setCodeError("Too many attempts. Wait a few minutes, then try again.");
      } else {
        setCodeError("That discount code isn't valid.");
      }
    } catch {
      setCodeError("Couldn't check the code. Check your connection and try again.");
    } finally {
      setCheckingCode(false);
    }
  }

  function removeCode() {
    setApplied(null);
    setCodeInput("");
    setCodeError("");
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !token || codePending) return;
    setBusy(true);
    try {
      await onSubmit({ name: attendee.name, email: attendee.email, phone: attendee.phone, turnstileToken: token, discountCode: applied?.code });
    } finally {
      setBusy(false);
      // Turnstile tokens are single-use: get a fresh one for any retry.
      if (!testMode) {
        setToken("");
        if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
      }
    }
  }

  return (
    <form onSubmit={submit} className="checkout space-y-5">
      <ul className="ticket-stub divide-y divide-dashed divide-line" aria-label="Selected seats">
        {selected.map((s) => {
          const tier = tierById.get(s.tierId);
          return (
            <li key={s.id} className="flex items-center gap-3 py-2">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: tier?.color }} aria-hidden="true" />
              <span className="font-semibold">{s.label}</span>
              <span className="text-muted">{tier?.name}</span>
              <span className="ml-auto tabular-nums">{tier ? formatInr(tier.pricePaise) : ""}</span>
            </li>
          );
        })}
        {applied && (
          <li className="flex items-baseline justify-between py-2 text-sm">
            <span className="font-semibold">Discount ({applied.percent}% off)</span>
            <span data-testid="checkout-discount" className="tabular-nums">&minus;{formatInr(discount)}</span>
          </li>
        )}
        <li className="flex items-baseline justify-between pt-3">
          <span className="font-semibold">Total</span>
          <span data-testid="checkout-total" className="text-xl font-bold tabular-nums">{formatInr(total)}</span>
        </li>
      </ul>

      <div className="field">
        <label htmlFor="discount-code"><span>Discount code</span></label>
        {applied ? (
          <p className="m-0 flex items-center gap-3 text-sm">
            <span className="font-semibold">{applied.code} applied</span>
            <button type="button" className="underline" onClick={removeCode} disabled={busy}>Remove</button>
          </p>
        ) : (
          <div className="flex gap-3">
            <input
              id="discount-code"
              value={codeInput}
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="e.g. REKINDLE10"
              onChange={(e) => { setCodeInput(e.target.value); setCodeError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void applyCode(); } }}
            />
            <button type="button" className="btn-ghost" onClick={applyCode} disabled={!codeInput.trim() || checkingCode || busy}>
              {checkingCode ? "Checking…" : "Apply"}
            </button>
          </div>
        )}
        {codeError && <small role="alert" className="!text-danger font-medium">{codeError}</small>}
        {codePending && !codeError && <small>Tap Apply to use this code, or clear it to continue.</small>}
      </div>

      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-[22px] bg-sand px-5 py-4 text-sm">
        <dt className="text-muted">Name</dt>
        <dd className="m-0 font-semibold">{attendee.name}</dd>
        <dt className="text-muted">Email</dt>
        <dd className="m-0 break-all font-semibold">{attendee.email}</dd>
        <dt className="text-muted">Mobile</dt>
        <dd className="m-0 font-semibold">{attendee.phone}</dd>
        <dd className="col-span-2 m-0 pt-1">
          <Link href="/register" className="font-semibold underline">Edit details</Link>
          <span className="text-muted"> &middot; tickets are emailed to this address</span>
        </dd>
      </dl>

      {!testMode && <div ref={widgetEl} className="min-h-[65px]" />}
      {widgetError && (
        <p className="text-sm text-danger">The security check didn&apos;t load. Refresh the page and try again.</p>
      )}

      <p className="text-sm text-muted">
        We use your name, email and phone only for this booking and its tickets.
      </p>

      <div className="flex gap-3">
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>Back</button>
        )}
        <button type="submit" className="btn-primary flex-1" disabled={busy || !token || codePending}>
          {busy ? "Reserving seats…" : `Pay ${formatInr(total)}`}
        </button>
      </div>
    </form>
  );
}
