"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import type { SeatView, TierView } from "@/server/seats/listSeats";

type Props = {
  seats: SeatView[];
  tiers: TierView[];
  selected: string[];
  onToggle: (seatId: string) => void;
  maxSelectable: number;
  /** Shown when a pick would go over `maxSelectable`; defaults to the per-booking maximum. */
  limitMessage?: string;
  /** Admin tooling: blocked seats are selectable too (held and sold never are). */
  adminMode?: boolean;
};

const PAD = 28;
const STAGE_SPACE = 70;
const ZOOM_STEPS = [1, 1.5, 2, 3];

/** Seat radius: a little under half the tightest horizontal spacing within a row, capped. */
function seatRadius(seats: SeatView[]): number {
  const byRow = new Map<number, number[]>();
  for (const s of seats) byRow.set(s.y, [...(byRow.get(s.y) ?? []), s.x]);
  let min = Infinity;
  for (const xs of byRow.values()) {
    xs.sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) if (xs[i] > xs[i - 1]) min = Math.min(min, xs[i] - xs[i - 1]);
  }
  return Number.isFinite(min) ? Math.min(12, min * 0.4) : 12;
}

export function SeatMap({ seats, tiers, selected, onToggle, maxSelectable, limitMessage, adminMode = false }: Props) {
  const [zoom, setZoom] = useState(0);
  const [limitHit, setLimitHit] = useState(false);
  const tierById = useMemo(() => new Map(tiers.map((t) => [t.id, t])), [tiers]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const layout = useMemo(() => {
    if (seats.length === 0) return null;
    const xs = seats.map((s) => s.x);
    const ys = seats.map((s) => s.y);
    const r = seatRadius(seats);
    const minX = Math.min(...xs) - PAD - r;
    const maxX = Math.max(...xs) + PAD + r;
    const minY = Math.min(...ys) - STAGE_SPACE - r;
    const maxY = Math.max(...ys) + PAD + r;
    const rows = new Map<string, { label: string; x: number; y: number }>();
    for (const s of seats) {
      const key = `${s.section}|${s.row}|${s.y}`;
      const cur = rows.get(key);
      if (!cur || s.x < cur.x) rows.set(key, { label: s.row, x: s.x, y: s.y });
    }
    return { r, minX, minY, w: maxX - minX, h: maxY - minY, rows: [...rows.values()] };
  }, [seats]);

  if (!layout) return <p className="p-6 text-muted">No seats are on sale yet.</p>;

  const selectable = (seat: SeatView) =>
    seat.status === "available" || (adminMode && seat.status === "blocked");

  function toggle(seat: SeatView) {
    const isSelected = selectedSet.has(seat.id);
    if (!isSelected && !selectable(seat)) return;
    if (!isSelected && selected.length >= maxSelectable) {
      setLimitHit(true);
      return;
    }
    setLimitHit(false);
    onToggle(seat.id);
  }

  function onKey(e: KeyboardEvent, seat: SeatView) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle(seat);
    }
  }

  const { r, minX, minY, w, h } = layout;
  const scale = ZOOM_STEPS[zoom];
  const stageY = minY + 18;
  const cx = minX + w / 2;

  return (
    <div className="relative">
      <div className="absolute right-2 top-2 z-10 flex gap-1">
        <button type="button" className="zoom-btn" aria-label="Zoom out" disabled={zoom === 0}
          onClick={() => setZoom((z) => Math.max(0, z - 1))}>&minus;</button>
        <button type="button" className="zoom-btn" aria-label="Zoom in" disabled={zoom === ZOOM_STEPS.length - 1}
          onClick={() => setZoom((z) => Math.min(ZOOM_STEPS.length - 1, z + 1))}>+</button>
      </div>

      <div className="max-h-[62vh] overflow-auto overscroll-contain">
        <div style={{ width: `calc(${scale} * max(100%, ${Math.round(w)}px))` }}>
          <svg viewBox={`${minX} ${minY} ${w} ${h}`} className="block h-auto w-full" role="group" aria-label="Seat map">
            <defs>
              <radialGradient id="stage-glow" cx="50%" cy="0%" r="90%">
                <stop offset="0%" stopColor="#F9A90B" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#F9A90B" stopOpacity="0" />
              </radialGradient>
            </defs>
            <ellipse cx={cx} cy={stageY} rx={w * 0.42} ry={34} fill="url(#stage-glow)" aria-hidden="true" />
            <path
              d={`M ${minX + w * 0.18} ${stageY} Q ${cx} ${stageY + 26} ${minX + w * 0.82} ${stageY}`}
              fill="none" stroke="#0B1020" strokeWidth={3} strokeLinecap="round" aria-hidden="true"
            />
            <text x={cx} y={stageY + 4} textAnchor="middle" className="stage-label" aria-hidden="true">Stage</text>

            {layout.rows.map((row) => (
              <text key={`${row.label}-${row.x}-${row.y}`} x={row.x - r - 8} y={row.y} textAnchor="end"
                dominantBaseline="central" className="row-label" aria-hidden="true">{row.label}</text>
            ))}

            {seats.map((seat) => {
              const tier = tierById.get(seat.tierId);
              const isSelected = selectedSet.has(seat.id);
              const open = selectable(seat);
              const blockedView = adminMode && seat.status === "blocked";
              const actionable = open || isSelected;
              const label = `${seat.label}, ${tier?.name ?? "Unknown tier"}, ${seat.status}`;
              const k = r * 0.45;
              return (
                <g
                  key={seat.id}
                  role="button"
                  tabIndex={actionable ? 0 : -1}
                  aria-label={label}
                  aria-pressed={isSelected}
                  aria-disabled={!actionable}
                  className={`seat ${actionable ? "seat-open" : "seat-taken"}`}
                  onClick={() => toggle(seat)}
                  onKeyDown={(e) => onKey(e, seat)}
                >
                  <title>{label}</title>
                  <circle className="seat-focus" cx={seat.x} cy={seat.y} r={r + 4} />
                  {isSelected ? (
                    <>
                      <circle cx={seat.x} cy={seat.y} r={r} fill="#0B1020" stroke={tier?.color ?? "#888"} strokeWidth={3} />
                      <path d={`M ${seat.x - k} ${seat.y} l ${k * 0.7} ${k * 0.7} l ${k * 1.3} ${-k * 1.4}`}
                        fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                    </>
                  ) : blockedView ? (
                    <circle cx={seat.x} cy={seat.y} r={r} fill="#4A5160" stroke={tier?.color ?? "#888"} strokeWidth={2.5} strokeDasharray="3 2" />
                  ) : open ? (
                    <circle cx={seat.x} cy={seat.y} r={r} fill={tier?.color ?? "#888"} stroke="#ffffff" strokeWidth={1.5} />
                  ) : (
                    <>
                      <circle cx={seat.x} cy={seat.y} r={r} fill="#E6DFCC" stroke="#D8D2C2" strokeWidth={1} />
                      <path d={`M ${seat.x - k} ${seat.y - k} L ${seat.x + k} ${seat.y + k} M ${seat.x + k} ${seat.y - k} L ${seat.x - k} ${seat.y + k}`}
                        stroke="#8F887A" strokeWidth={1.6} strokeLinecap="round" />
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <p role="status" aria-live="polite" className="min-h-0 px-4 text-sm font-medium text-danger empty:hidden">
        {limitHit ? (limitMessage ?? `Maximum ${maxSelectable} seats per booking`) : ""}
      </p>
    </div>
  );
}
