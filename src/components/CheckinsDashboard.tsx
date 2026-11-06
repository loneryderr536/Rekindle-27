"use client";

import { useEffect, useRef, useState } from "react";
import type { CheckinDashboard } from "@/server/admin/checkins";

const POLL_MS = 7000;

const timeOf = (iso: string | Date) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });

/** Live-ish check-in progress for the admin "day of" view; polls like the seat map, with an ETag so idle polls are cheap. */
export function CheckinsDashboard({ initial }: { initial: CheckinDashboard }) {
  const [data, setData] = useState(initial);
  const [stale, setStale] = useState(false);
  const etagRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/admin/checkins", {
          cache: "no-store",
          headers: etagRef.current ? { "If-None-Match": etagRef.current } : undefined,
        });
        if (cancelled) return;
        if (res.status === 304) {
          setStale(false);
          return;
        }
        if (!res.ok) {
          setStale(true);
          return;
        }
        etagRef.current = res.headers.get("etag");
        setData((await res.json()) as CheckinDashboard);
        setStale(false);
      } catch {
        if (!cancelled) setStale(true);
      }
    };
    const id = setInterval(tick, POLL_MS);
    const onVisibility = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const { totals, byGate, recent } = data;
  const pct = totals.totalValid > 0 ? Math.round((totals.checkedIn / totals.totalValid) * 100) : 0;

  return (
    <div className="space-y-8">
      <section aria-label="Check-in progress" className="o26-navy rounded-xl p-5 text-white">
        <div className="flex items-baseline justify-between">
          <p className="text-sm text-white/70">Checked in</p>
          {stale && <p className="text-xs text-white/60">Connection lost — retrying…</p>}
        </div>
        <p className="font-display text-4xl font-bold text-marigold">
          {totals.checkedIn} <span className="text-2xl text-white/70">/ {totals.totalValid}</span>
        </p>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-marigold transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-sm text-white/70">{pct}% of valid tickets</p>
      </section>

      <section aria-labelledby="gate-h" className="space-y-3">
        <h2 id="gate-h" className="font-display text-lg font-bold">By gate</h2>
        <div className="overflow-x-auto o26-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="p-3">Gate</th>
                <th className="p-3 text-right">Checked in</th>
              </tr>
            </thead>
            <tbody>
              {byGate.length === 0 && (
                <tr>
                  <td colSpan={2} className="p-3 text-muted">No check-ins yet.</td>
                </tr>
              )}
              {byGate.map((g) => (
                <tr key={g.gate} className="border-b border-line last:border-0">
                  <th scope="row" className="p-3 font-semibold">{g.gate}</th>
                  <td className="p-3 text-right tabular-nums">{g.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="recent-h" className="space-y-3">
        <h2 id="recent-h" className="font-display text-lg font-bold">Recent check-ins</h2>
        <ul className="divide-y divide-line o26-card">
          {recent.length === 0 && <li className="p-3 text-muted">No check-ins yet.</li>}
          {recent.map((r) => (
            <li key={r.ticketId} className="flex items-center justify-between gap-3 p-3 text-sm">
              <span className="font-semibold">{r.guestName}</span>
              <span className="text-muted">{r.gate} · {timeOf(r.checkedInAt)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
