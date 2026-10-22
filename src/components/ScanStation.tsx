"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { QrScanner } from "@/components/QrScanner";

type Result =
  | { result: "ok"; seatLabel: string; tierName: string; firstName: string }
  | { result: "already"; checkedInAt: string; gate: string }
  | { result: "invalid" };

type Found = {
  ticketId: string; seatLabel: string; tierName: string; bookingCode: string; guestName: string;
  bookingStatus: string; checkedInAt: string | null; gate: string | null;
};

const GATE_KEY = "scan-gate";
const FLASH_MS = 2500;

function readGate(): string {
  try {
    return localStorage.getItem(GATE_KEY) ?? "";
  } catch {
    return "";
  }
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function ScanStation() {
  const router = useRouter();
  const [gate, setGate] = useState("");
  const [flash, setFlash] = useState<Result | { result: "error"; message: string } | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const gateRef = useRef("");
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const saved = readGate();
    gateRef.current = saved;
    queueMicrotask(() => setGate(saved));
    return () => clearTimeout(timer.current);
  }, []);

  function changeGate(value: string) {
    setGate(value);
    gateRef.current = value;
    try {
      localStorage.setItem(GATE_KEY, value);
    } catch {
      // Storage can be blocked; the name still applies for this session.
    }
  }

  const show = useCallback((r: Result | { result: "error"; message: string }) => {
    clearTimeout(timer.current);
    setFlash(r);
    if (r.result !== "ok") navigator.vibrate?.(200);
    timer.current = setTimeout(() => setFlash(null), FLASH_MS);
  }, []);

  const post = useCallback(
    async (path: string, body: object): Promise<Result | { result: "error"; message: string }> => {
      try {
        const res = await fetch(path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) return (await res.json()) as Result;
        const e = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        return { result: "error", message: e?.error?.message ?? "Scan failed. Try again." };
      } catch {
        return { result: "error", message: "No connection. Try again." };
      }
    },
    [],
  );

  const onCode = useCallback(
    async (text: string) => {
      if (busy.current) return;
      const g = gateRef.current.trim();
      if (!g) {
        show({ result: "error", message: "Enter the gate name first" });
        return;
      }
      busy.current = true;
      try {
        show(await post("/api/scan", { payload: text, gate: g }));
      } finally {
        busy.current = false;
      }
    },
    [post, show],
  );

  async function runSearch(e: FormEvent) {
    e.preventDefault();
    setSearchError(null);
    setFound(null);
    try {
      const res = await fetch(`/api/scan/search?q=${encodeURIComponent(query.trim())}`);
      if (!res.ok) {
        setSearchError(res.status === 400 ? "Enter at least 2 characters." : "Search failed. Try again.");
        return;
      }
      setFound(((await res.json()) as { tickets: Found[] }).tickets);
    } catch {
      setSearchError("No connection. Try again.");
    }
  }

  async function manualCheckIn(t: Found) {
    const g = gate.trim();
    if (!g) {
      show({ result: "error", message: "Enter the gate name first" });
      return;
    }
    const r = await post("/api/scan/checkin", { ticketId: t.ticketId, gate: g });
    show(r);
    if (r.result === "ok" || r.result === "already") {
      setFound((list) =>
        list?.map((x) =>
          x.ticketId === t.ticketId
            ? {
                ...x,
                checkedInAt: r.result === "already" ? r.checkedInAt : new Date().toISOString(),
                gate: r.result === "already" ? r.gate : g,
              }
            : x,
        ) ?? null,
      );
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    router.push("/admin/login");
  }

  return (
    <main className="mx-auto w-full max-w-md space-y-6 px-4 py-6">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold text-plum">Gate scanner</h1>
        <button type="button" className="btn-ghost" onClick={logout}>
          Log out
        </button>
      </header>

      <label className="field">
        <span>Gate name</span>
        <input value={gate} onChange={(e) => changeGate(e.target.value)} maxLength={40} placeholder="e.g. Main gate" />
      </label>

      <QrScanner onResult={onCode} />

      <section aria-labelledby="manual-h" className="space-y-3">
        <h2 id="manual-h" className="font-display text-xl font-bold text-plum">
          Manual check-in
        </h2>
        <form onSubmit={runSearch} className="flex gap-2">
          <label className="field flex-1">
            <span className="sr-only">Booking code or phone</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Booking code or phone" maxLength={40} />
          </label>
          <button type="submit" className="btn-primary min-h-12">
            Search
          </button>
        </form>
        {searchError && (
          <p role="alert" className="text-danger">
            {searchError}
          </p>
        )}
        {found && found.length === 0 && <p className="text-muted">No tickets found.</p>}
        <ul className="space-y-3">
          {found?.map((t) => {
            const valid = t.bookingStatus === "paid" || t.bookingStatus === "comp";
            return (
              <li key={t.ticketId} className="rounded-xl border border-line bg-white p-4">
                <p className="text-lg font-bold">
                  {t.tierName} · {t.seatLabel}
                </p>
                <p className="text-muted">
                  {t.guestName} · {t.bookingCode}
                </p>
                {!valid && <p className="font-semibold text-danger">Booking is {t.bookingStatus.replace("_", " ")}</p>}
                {t.checkedInAt && (
                  <p className="font-semibold text-danger">
                    Checked in {timeOf(t.checkedInAt)}
                    {t.gate ? `, ${t.gate}` : ""}
                  </p>
                )}
                <button
                  type="button"
                  className="btn-primary mt-3 min-h-14 w-full text-lg"
                  disabled={!valid || !!t.checkedInAt}
                  onClick={() => manualCheckIn(t)}
                >
                  {t.checkedInAt ? "Already checked in" : "Check in"}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {flash && (
        <div
          role="alert"
          onClick={() => setFlash(null)}
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 p-6 text-center text-white ${
            flash.result === "ok" ? "bg-green-700" : "bg-red-700"
          }`}
        >
          {flash.result === "ok" ? (
            <>
              <p className="font-display text-6xl font-bold">{flash.tierName}</p>
              <p className="font-display text-5xl">{flash.seatLabel}</p>
              <p className="text-3xl">{flash.firstName}</p>
            </>
          ) : flash.result === "already" ? (
            <>
              <p className="font-display text-5xl font-bold">Already scanned</p>
              <p className="text-2xl">
                Already scanned at {timeOf(flash.checkedInAt)}, {flash.gate}
              </p>
            </>
          ) : flash.result === "invalid" ? (
            <p className="font-display text-5xl font-bold">Invalid ticket</p>
          ) : (
            <p className="text-3xl font-bold">{flash.message}</p>
          )}
        </div>
      )}
    </main>
  );
}
