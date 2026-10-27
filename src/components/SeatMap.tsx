"use client";

import { useMemo, useState } from "react";
import { EVENT } from "@/lib/event";
import { formatInr } from "@/lib/money";
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

type RowView = { key: string; label: string; gapBefore: boolean; blocks: SeatView[][] };

/** Smallest positive difference between neighbouring values, or Infinity when there is none. */
function minStep(values: number[]): number {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  let min = Infinity;
  for (let i = 1; i < sorted.length; i++) min = Math.min(min, sorted[i] - sorted[i - 1]);
  return min;
}

/**
 * Lays the seats out as the theatre plan: rows ordered front to back by `y`, each row split into
 * blocks wherever the x spacing jumps (the aisles), with extra space before a row that is set apart in y.
 */
function buildRows(seats: SeatView[]): RowView[] {
  const byRow = new Map<string, SeatView[]>();
  for (const s of seats) {
    const key = `${s.y}|${s.section}|${s.row}`;
    byRow.set(key, [...(byRow.get(key) ?? []), s]);
  }
  const rowYs = [...byRow.values()].map((r) => r[0].y);
  const rowStep = minStep(rowYs);
  let xStep = Infinity;
  for (const r of byRow.values()) xStep = Math.min(xStep, minStep(r.map((s) => s.x)));

  const ordered = [...byRow.entries()].sort(([, a], [, b]) => a[0].y - b[0].y || a[0].x - b[0].x);
  let prevY: number | null = null;
  return ordered.map(([key, row]) => {
    row.sort((a, b) => a.x - b.x);
    const blocks: SeatView[][] = [];
    for (const s of row) {
      const last = blocks[blocks.length - 1];
      const prev = last?.[last.length - 1];
      if (last && prev && s.x - prev.x <= xStep * 1.5) last.push(s);
      else blocks.push([s]);
    }
    const y = row[0].y;
    const gapBefore = prevY !== null && y - prevY > rowStep * 1.5;
    prevY = y;
    return { key, label: row[0].row, gapBefore, blocks };
  });
}

const SEAT_BASE = { width: 20, height: 18, padding: 0, border: 0, borderRadius: 4 } as const;
const GOLD = "#F9A90B";

function Swatch({ style }: { style: React.CSSProperties }) {
  return <span aria-hidden="true" style={{ width: 18, height: 14, borderRadius: 4, display: "block", ...style }} />;
}

export function SeatMap({ seats, tiers, selected, onToggle, maxSelectable, limitMessage, adminMode = false }: Props) {
  const [limitHit, setLimitHit] = useState(false);
  const tierById = useMemo(() => new Map(tiers.map((t) => [t.id, t])), [tiers]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const rows = useMemo(() => buildRows(seats), [seats]);
  // With more than one tier the dearest one is the premium (gold) tier and is drawn with a gold rim.
  const premiumId = useMemo(() => {
    if (tiers.length < 2) return null;
    return tiers.reduce((best, t) => (t.pricePaise > best.pricePaise ? t : best)).id;
  }, [tiers]);

  if (seats.length === 0) return <p className="p-6 text-muted">No seats are on sale yet.</p>;

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

  function seatStyle(seat: SeatView, actionable: boolean, isSelected: boolean): React.CSSProperties {
    const premium = seat.tierId === premiumId;
    if (isSelected) return { background: GOLD, boxShadow: "0 0 12px rgba(249, 169, 11, 0.9)" };
    if (adminMode && seat.status === "blocked") {
      return { background: "#4A5160", boxShadow: `inset 0 0 0 1.5px ${GOLD}`, backgroundClip: "padding-box" };
    }
    if (!actionable) return { background: "#070B16", boxShadow: "inset 0 0 0 1px rgba(253, 251, 244, 0.16)" };
    return premium
      ? { background: "#FFF3D1", boxShadow: `inset 0 0 0 2px ${tierById.get(seat.tierId)?.color ?? GOLD}` }
      : { background: "#FDFBF4" };
  }

  return (
    <div className="o26-seatmap relative mx-auto w-full max-w-[460px] pb-8 text-[#FDFBF4]">
      <div className="relative flex flex-col items-center gap-0.5 px-[26px] pt-2 text-center">
        <span className="text-xs text-[#C9CCD8]">{EVENT.weekdayDate}</span>
        <span className="font-display text-[22px] font-semibold">ONE·26 {EVENT.name}</span>
      </div>

      <ul className="relative mt-6 flex flex-wrap justify-center gap-x-7 gap-y-3 px-4 text-xs text-[#E6E3DA]">
        {tiers.map((t) => (
          <li key={t.id} className="flex flex-col items-center gap-1.5">
            <Swatch style={t.id === premiumId ? { background: "#FFF3D1", boxShadow: `inset 0 0 0 2px ${t.color}` } : { background: "#FDFBF4" }} />
            <span>{t.name} · <span className="font-semibold tabular-nums">{formatInr(t.pricePaise).replace(/\.00$/, "")}</span></span>
          </li>
        ))}
        <li className="flex flex-col items-center gap-1.5">
          <Swatch style={{ background: "#070B16", boxShadow: "inset 0 0 0 1px rgba(253, 251, 244, 0.18)" }} />
          Taken
        </li>
        <li className="flex flex-col items-center gap-1.5">
          <Swatch style={{ background: GOLD, boxShadow: "0 0 10px rgba(249, 169, 11, 0.8)" }} />
          Selected
        </li>
      </ul>

      <div aria-hidden="true" className="relative mx-auto mt-6" style={{ width: 300, height: 54 }}>
        <svg viewBox="0 0 300 54" width="300" height="54" style={{ display: "block" }}>
          <defs>
            <linearGradient id="stArc" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#FF4520" /><stop offset="0.5" stopColor="#F9A90B" /><stop offset="1" stopColor="#1A8AA8" />
            </linearGradient>
            <linearGradient id="stLight" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#F9A90B" stopOpacity="0.55" /><stop offset="1" stopColor="#F9A90B" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M6 30 Q150 -6 294 30 L282 40 Q150 10 18 40 Z" fill="url(#stArc)" />
          <path d="M18 40 Q150 10 282 40 L300 54 L0 54 Z" fill="url(#stLight)" opacity="0.6" />
        </svg>
      </div>
      <div aria-hidden="true" className="relative mt-0.5 text-center text-[11px] font-semibold tracking-[3px] text-[#FDFBF4]/75">STAGE</div>

      <div role="group" aria-label="Seat map" className="relative mt-[22px] flex flex-col items-center overflow-x-auto px-2" style={{ gap: 9 }}>
        {rows.map((row) => (
          <div key={row.key} style={{ display: "flex", alignItems: "center", gap: 14, marginTop: row.gapBefore ? 16 : 0 }}>
            <span aria-hidden="true" style={{ width: 14, fontSize: 10, fontWeight: 600, color: "rgba(253, 251, 244, 0.55)", textAlign: "center" }}>{row.label}</span>
            {row.blocks.map((block, bi) => (
              <div key={bi} style={{ display: "flex", gap: 5 }}>
                {block.map((seat) => {
                  const tier = tierById.get(seat.tierId);
                  const isSelected = selectedSet.has(seat.id);
                  const actionable = selectable(seat) || isSelected;
                  return (
                    <button
                      key={seat.id}
                      type="button"
                      className="seat"
                      aria-label={`${seat.label}, ${tier?.name ?? "Unknown tier"}, ${seat.status}`}
                      aria-pressed={isSelected}
                      aria-disabled={!actionable}
                      tabIndex={actionable ? 0 : -1}
                      title={`${seat.label} · ${tier?.name ?? ""}`}
                      onClick={() => toggle(seat)}
                      style={{ ...SEAT_BASE, cursor: actionable ? "pointer" : "not-allowed", ...seatStyle(seat, actionable, isSelected) }}
                    />
                  );
                })}
              </div>
            ))}
            <span aria-hidden="true" style={{ width: 14, fontSize: 10, fontWeight: 600, color: "rgba(253, 251, 244, 0.55)", textAlign: "center" }}>{row.label}</span>
          </div>
        ))}
      </div>

      <p role="status" aria-live="polite" className="relative min-h-0 px-6 pt-4 text-center text-sm font-medium text-[#FFB4A8] empty:hidden">
        {limitHit ? (limitMessage ?? `Maximum ${maxSelectable} seats per booking`) : ""}
      </p>
    </div>
  );
}
