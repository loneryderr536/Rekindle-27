"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { SeatMap } from "@/components/SeatMap";
import type { SeatView, TierView } from "@/server/seats/listSeats";

type Data = { seats: SeatView[]; tiers: TierView[] };
type Note = { ok: boolean; text: string };

type Reply = {
  ok: boolean;
  data: {
    blocked?: string[]; unblocked?: string[]; assigned?: string[]; skipped?: string[]; publicCode?: string;
    error?: { message?: string; details?: { seatIds?: string[] } };
  } | null;
};

async function post(path: string, body: unknown): Promise<Reply> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, data: await res.json().catch(() => null) };
  } catch {
    return { ok: false, data: { error: { message: "Network problem. Please try again." } } };
  }
}

export function AdminSeats({ initial }: { initial: Data }) {
  const [data, setData] = useState<Data>(initial);
  const [selected, setSelected] = useState<string[]>([]);
  const [tierId, setTierId] = useState(initial.tiers[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [compOpen, setCompOpen] = useState(false);
  const [comp, setComp] = useState({ name: "", email: "", phone: "" });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/seats", { cache: "no-store" });
      if (!res.ok) return;
      const next = (await res.json()) as Data;
      setData(next);
      // Keep only selections that are still actionable after the refresh.
      const ok = new Set(next.seats.filter((s) => s.status === "available" || s.status === "blocked").map((s) => s.id));
      setSelected((cur) => cur.filter((id) => ok.has(id)));
    } catch {
      /* next poll will retry */
    }
  }, []);

  useEffect(() => {
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, [refresh]);

  const counts = useMemo(() => {
    const c = { available: 0, held: 0, sold: 0, blocked: 0 };
    for (const s of data.seats) c[s.status]++;
    return c;
  }, [data.seats]);

  function describe(r: Reply, success: string): Note {
    if (r.ok) return { ok: true, text: success };
    const e = r.data?.error;
    const ids: string[] = e?.details?.seatIds ?? [];
    const labels = ids.map((id) => data.seats.find((s) => s.id === id)?.label).filter(Boolean);
    return { ok: false, text: `${e?.message ?? "Request failed."}${labels.length ? ` (${labels.join(", ")})` : ""}` };
  }

  async function run(body: Record<string, unknown>, success: (d: NonNullable<Reply["data"]>) => string) {
    setBusy(true);
    setNote(null);
    const r = await post("/api/admin/seats", { ...body, seatIds: selected });
    setNote(describe(r, r.ok && r.data ? success(r.data) : ""));
    if (r.ok) setSelected([]);
    await refresh();
    setBusy(false);
  }

  async function submitComp(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    const r = await post("/api/admin/comp", { seatIds: selected, ...comp });
    setNote(describe(r, r.ok ? `Comp issued: booking ${r.data?.publicCode}. Tickets are being emailed.` : ""));
    if (r.ok) {
      setSelected([]);
      setCompOpen(false);
      setComp({ name: "", email: "", phone: "" });
    }
    await refresh();
    setBusy(false);
  }

  const none = selected.length === 0 || busy;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {counts.available} available, {counts.blocked} blocked, {counts.held} held, {counts.sold} sold.
        Dashed dark seats are blocked. Held and sold seats cannot be selected.
      </p>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white p-3">
        <span className="mr-2 text-sm font-semibold">{selected.length} selected</span>
        <button type="button" className="btn-primary" disabled={none} onClick={() => run({ action: "block" }, (d) => `Blocked ${d.blocked?.length ?? 0}, skipped ${d.skipped?.length ?? 0}.`)}>Block</button>
        <button type="button" className="btn-primary" disabled={none} onClick={() => run({ action: "unblock" }, (d) => `Unblocked ${d.unblocked?.length ?? 0}, skipped ${d.skipped?.length ?? 0}.`)}>Unblock</button>
        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only">Tier</span>
          <select value={tierId} onChange={(e) => setTierId(e.target.value)} className="rounded-lg border border-line bg-white px-2 py-2">
            {data.tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <button type="button" className="btn-ghost" disabled={none || !tierId} onClick={() => run({ action: "assignTier", tierId }, (d) => `Moved ${d.assigned?.length ?? 0} seats to the tier.`)}>Assign to tier</button>
        <button type="button" className="btn-ghost" disabled={none} onClick={() => setCompOpen((o) => !o)}>Issue comp</button>
      </div>

      {compOpen && (
        <form onSubmit={submitComp} className="grid gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-3">
          <label className="field"><span>Guest name</span>
            <input required minLength={2} maxLength={80} value={comp.name} onChange={(e) => setComp({ ...comp, name: e.target.value })} /></label>
          <label className="field"><span>Email</span>
            <input required type="email" value={comp.email} onChange={(e) => setComp({ ...comp, email: e.target.value })} /></label>
          <label className="field"><span>Mobile</span>
            <input required inputMode="tel" value={comp.phone} onChange={(e) => setComp({ ...comp, phone: e.target.value })} /></label>
          <div className="sm:col-span-3">
            <button type="submit" className="btn-primary" disabled={none}>{busy ? "Issuing..." : `Issue comp for ${selected.length} seat(s)`}</button>
          </div>
        </form>
      )}

      {note && <p role="status" className={note.ok ? "text-sm font-medium" : "text-sm font-medium text-danger"}>{note.text}</p>}

      <div className="rounded-xl border border-line bg-white">
        <SeatMap
          seats={data.seats}
          tiers={data.tiers}
          selected={selected}
          maxSelectable={1000}
          adminMode
          onToggle={(id) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))}
        />
      </div>
    </div>
  );
}
