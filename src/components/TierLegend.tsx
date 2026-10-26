import { formatInr } from "@/lib/money";
import type { TierView } from "@/server/seats/listSeats";

/** Tier prices plus the selected/unavailable seat markers used on the map. */
export function TierLegend({ tiers }: { tiers: TierView[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      {tiers.map((t) => (
        <li key={t.id} className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" fill={t.color} stroke="#fff" strokeWidth="1.5" />
          </svg>
          <span>{t.name}</span>
          <span className="font-semibold tabular-nums">{formatInr(t.pricePaise)}</span>
        </li>
      ))}
      <li className="flex items-center gap-2 text-muted">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" fill="#0B1020" />
          <path d="M5 8l2 2 4-4.2" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Your pick
      </li>
      <li className="flex items-center gap-2 text-muted">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" fill="#E6DFCC" stroke="#D8D2C2" />
          <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#8F887A" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        Taken
      </li>
    </ul>
  );
}
