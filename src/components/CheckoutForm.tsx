"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Attendee } from "@/lib/attendee";
import { formatInr } from "@/lib/money";
import type { SeatView, TierView } from "@/server/seats/listSeats";

export type CheckoutDetails = { name: string; email: string; phone: string; turnstileToken: string };

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
  const total = selected.reduce((sum, s) => sum + (tierById.get(s.tierId)?.pricePaise ?? 0), 0);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !token) return;
    setBusy(true);
    try {
      await onSubmit({ name: attendee.name, email: attendee.email, phone: attendee.phone, turnstileToken: token });
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
        <li className="flex items-baseline justify-between pt-3">
          <span className="font-semibold">Total</span>
          <span data-testid="checkout-total" className="text-xl font-bold tabular-nums">{formatInr(total)}</span>
        </li>
      </ul>

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
        <button type="submit" className="btn-primary flex-1" disabled={busy || !token}>
          {busy ? "Reserving seats…" : `Pay ${formatInr(total)}`}
        </button>
      </div>
    </form>
  );
}
