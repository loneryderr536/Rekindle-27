"use client";

import { useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { SeatView, TierView } from "@/server/seats/listSeats";

type Data = { seats: SeatView[]; tiers: TierView[] };

/** A seat staged in the browser only: everything `importSeats` needs, but no database id yet. */
type DraftSeat = { key: string; section: string; row: string; number: number; x: number; y: number; tierId: string };

const SCALE = 2; // on-screen px per layout unit (the seed CSVs use a 30-unit grid)
const GRID = 10; // snap increment, in layout units
const PAD = 60; // layout units of canvas margin past the furthest seat

const snap = (v: number) => Math.round(v / GRID) * GRID;

/**
 * Visual venue layout tool: drag existing seats to reposition them, or click in "Add seats" mode to
 * place new ones, then save the whole batch in one call to /api/admin/seats/design (which upserts by
 * label through the same `importSeats` rules as `npm run seed:seats` — an existing seat only moves
 * while it is `available`, so this can never displace someone's held or sold seat).
 *
 * To avoid a label collision creating an orphan row, this tool only ever changes an EXISTING seat's
 * position and tier — never its section/row/number, since `importSeats` upserts by that label. Give a
 * seat a new section/row/number by adding it fresh and leaving the old one blocked from Admin > Seats.
 */
export function SeatDesigner({ initial }: { initial: Data }) {
  const [data, setData] = useState<Data>(initial);
  const [moved, setMoved] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [tierChanges, setTierChanges] = useState<Map<string, string>>(new Map());
  const [drafts, setDrafts] = useState<DraftSeat[]>([]);
  const [mode, setMode] = useState<"move" | "add">("move");
  const [addTierId, setAddTierId] = useState(initial.tiers[0]?.id ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingClick, setPendingClick] = useState<{ x: number; y: number } | null>(null);
  const [form, setForm] = useState({ section: "", row: "", number: "" });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);

  const tierById = useMemo(() => new Map(data.tiers.map((t) => [t.id, t])), [data.tiers]);

  const bounds = useMemo(() => {
    const xs = [0, ...data.seats.map((s) => s.x), ...drafts.map((d) => d.x)];
    const ys = [0, ...data.seats.map((s) => s.y), ...drafts.map((d) => d.y)];
    return { w: (Math.max(...xs) + PAD) * SCALE, h: (Math.max(...ys) + PAD) * SCALE };
  }, [data.seats, drafts]);

  const posFor = (seat: SeatView) => moved.get(seat.id) ?? { x: seat.x, y: seat.y };

  function toLayoutCoords(clientX: number, clientY: number) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: snap(Math.max(0, (clientX - rect.left) / SCALE)), y: snap(Math.max(0, (clientY - rect.top) / SCALE)) };
  }

  function onCanvasClick(e: React.MouseEvent) {
    if (mode !== "add" || e.target !== canvasRef.current) return;
    setSelectedId(null);
    setPendingClick(toLayoutCoords(e.clientX, e.clientY));
    setForm({ section: "", row: "", number: "" });
  }

  function startDrag(e: ReactPointerEvent, seat: SeatView) {
    e.stopPropagation();
    setSelectedId(seat.id);
    if (mode !== "move") return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const start = posFor(seat);
    const rect = canvasRef.current!.getBoundingClientRect();
    dragRef.current = { id: seat.id, dx: e.clientX - rect.left - start.x * SCALE, dy: e.clientY - rect.top - start.y * SCALE, moved: false };
  }

  function onPointerMove(e: ReactPointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    d.moved = true;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = snap(Math.max(0, (e.clientX - rect.left - d.dx) / SCALE));
    const y = snap(Math.max(0, (e.clientY - rect.top - d.dy) / SCALE));
    setMoved((m) => new Map(m).set(d.id, { x, y }));
  }

  function endDrag() {
    dragRef.current = null;
  }

  function confirmAdd(e: FormEvent) {
    e.preventDefault();
    const number = Number(form.number);
    if (!pendingClick || !form.section.trim() || !form.row.trim() || !Number.isInteger(number) || number < 1) return;
    setDrafts((ds) => [
      ...ds,
      { key: `new:${Date.now()}:${ds.length}`, section: form.section.trim(), row: form.row.trim(), number, x: pendingClick.x, y: pendingClick.y, tierId: addTierId },
    ]);
    setPendingClick(null);
  }

  const selectedSeat = data.seats.find((s) => s.id === selectedId) ?? null;
  const dirtyCount = moved.size + tierChanges.size + drafts.length;

  async function save() {
    setBusy(true);
    setNote(null);
    const existingRows = data.seats.flatMap((s) => {
      const pos = moved.get(s.id);
      const tierId = tierChanges.get(s.id);
      if (!pos && !tierId) return [];
      const tier = tierById.get(tierId ?? s.tierId);
      if (!tier) return [];
      const at = pos ?? { x: s.x, y: s.y };
      return [{ section: s.section, row: s.row, number: s.number, x: at.x, y: at.y, tier: tier.name }];
    });
    const draftRows = drafts.flatMap((d) => {
      const tier = tierById.get(d.tierId);
      return tier ? [{ section: d.section, row: d.row, number: d.number, x: d.x, y: d.y, tier: tier.name }] : [];
    });
    try {
      const res = await fetch("/api/admin/seats/design", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows: [...existingRows, ...draftRows] }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setNote(err?.error?.message ?? "Save failed.");
        return;
      }
      const seatsRes = await fetch("/api/seats", { cache: "no-store" });
      if (seatsRes.ok) setData(await seatsRes.json());
      setMoved(new Map());
      setTierChanges(new Map());
      setDrafts([]);
      setSelectedId(null);
      setNote(`Saved ${existingRows.length + draftRows.length} seat(s).`);
    } catch {
      setNote("Network problem. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 o26-card p-3">
        <div className="flex overflow-hidden rounded-lg border border-line" role="group" aria-label="Tool">
          <button type="button" className={`px-3 py-1.5 text-sm font-semibold ${mode === "move" ? "bg-plum text-white" : ""}`} onClick={() => { setMode("move"); setPendingClick(null); }}>
            Move
          </button>
          <button type="button" className={`px-3 py-1.5 text-sm font-semibold ${mode === "add" ? "bg-plum text-white" : ""}`} onClick={() => { setMode("add"); setSelectedId(null); }}>
            Add seats
          </button>
        </div>
        {mode === "add" && (
          <label className="flex items-center gap-2 text-sm">
            <span>New seats&apos; tier</span>
            <select value={addTierId} onChange={(e) => setAddTierId(e.target.value)} className="rounded-lg border border-line bg-white px-2 py-1.5">
              {data.tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        )}
        <button type="button" className="btn-primary ml-auto" disabled={dirtyCount === 0 || busy} onClick={save}>
          {busy ? "Saving..." : `Save layout${dirtyCount ? ` (${dirtyCount})` : ""}`}
        </button>
      </div>

      {note && <p role="status" className="text-sm font-medium">{note}</p>}
      <p className="text-sm text-muted">
        {mode === "move" ? "Drag a seat to move it; click one to edit its tier." : "Click an empty spot on the plan to place a new seat."}
      </p>

      <div className="overflow-auto rounded-xl border border-line bg-[#0B1020] p-4">
        <div
          ref={canvasRef}
          onClick={onCanvasClick}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          className="relative"
          style={{ width: bounds.w, height: bounds.h, cursor: mode === "add" ? "copy" : "default" }}
        >
          {data.seats.map((seat) => {
            const { x, y } = posFor(seat);
            const tier = tierById.get(tierChanges.get(seat.id) ?? seat.tierId);
            const isSelected = selectedId === seat.id;
            return (
              <button
                key={seat.id}
                type="button"
                title={`${seat.label} · ${tier?.name ?? ""} · ${seat.status}`}
                onPointerDown={(e) => startDrag(e, seat)}
                className="absolute flex items-center justify-center rounded"
                style={{
                  left: x * SCALE, top: y * SCALE, width: 18, height: 16, transform: "translate(-50%, -50%)",
                  background: seat.status === "available" ? "#FDFBF4" : "#4A5160",
                  boxShadow: isSelected ? "0 0 0 2px #F9A90B" : `inset 0 0 0 2px ${tier?.color ?? "#9ca3af"}`,
                  cursor: mode === "move" ? "grab" : "default",
                }}
              />
            );
          })}
          {drafts.map((d) => (
            <div
              key={d.key}
              title={`${d.section}-${d.row}-${d.number} (unsaved)`}
              className="absolute flex items-center justify-center rounded border-2 border-dashed"
              style={{ left: d.x * SCALE, top: d.y * SCALE, width: 18, height: 16, transform: "translate(-50%, -50%)", borderColor: tierById.get(d.tierId)?.color ?? "#F9A90B", background: "rgba(253,251,244,0.35)" }}
            />
          ))}
          {pendingClick && (
            <form
              onSubmit={confirmAdd}
              className="absolute z-10 grid w-56 grid-cols-2 gap-2 rounded-lg border border-line bg-white p-3 shadow-lg"
              style={{ left: pendingClick.x * SCALE + 12, top: pendingClick.y * SCALE + 12 }}
            >
              <label className="field col-span-1"><span className="text-xs">Section</span>
                <input autoFocus required maxLength={20} value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} /></label>
              <label className="field col-span-1"><span className="text-xs">Row</span>
                <input required maxLength={20} value={form.row} onChange={(e) => setForm({ ...form, row: e.target.value })} /></label>
              <label className="field col-span-2"><span className="text-xs">Number</span>
                <input required type="number" min={1} value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></label>
              <div className="col-span-2 flex justify-end gap-2">
                <button type="button" className="btn-ghost" onClick={() => setPendingClick(null)}>Cancel</button>
                <button type="submit" className="btn-primary">Place</button>
              </div>
            </form>
          )}
        </div>
      </div>

      {selectedSeat && (
        <div className="flex flex-wrap items-center gap-3 o26-card p-4">
          <span className="font-semibold">{selectedSeat.label}</span>
          <span className="text-muted">{selectedSeat.status}</span>
          <label className="ml-auto flex items-center gap-2 text-sm">
            <span>Tier</span>
            <select
              value={tierChanges.get(selectedSeat.id) ?? selectedSeat.tierId}
              onChange={(e) => setTierChanges((m) => new Map(m).set(selectedSeat.id, e.target.value))}
              className="rounded-lg border border-line bg-white px-2 py-1.5"
            >
              {data.tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          {moved.has(selectedSeat.id) && (
            <button type="button" className="btn-ghost" onClick={() => setMoved((m) => { const n = new Map(m); n.delete(selectedSeat.id); return n; })}>
              Reset position
            </button>
          )}
        </div>
      )}

      {drafts.length > 0 && (
        <ul className="divide-y divide-line o26-card text-sm">
          {drafts.map((d) => (
            <li key={d.key} className="flex items-center justify-between gap-3 p-3">
              <span>{d.section}-{d.row}-{d.number} · {tierById.get(d.tierId)?.name}</span>
              <button type="button" className="btn-ghost" onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
