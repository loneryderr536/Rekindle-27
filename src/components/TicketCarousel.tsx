"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { TicketCard, TicketDetails, TicketFace } from "@/components/TicketCard";

type Ticket = { seatLabel: string; tierName: string; qr: string };
type Shared = {
  orderCode: string;
  holder: string;
  eventName: string;
  shortDate: string;
  longDate: string;
  hallLine: string;
  gatesOpen: string;
};

const CARD_W = 250;
const STAGE_H = 430;
const SWIPE_PX = 40;

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** One ticket stands alone; several ride a ring, and Next turns the ring so the following ticket comes round to the front. */
export function TicketSet({ tickets, ...shared }: { tickets: Ticket[] } & Shared) {
  if (tickets.length === 1) return <TicketCard {...tickets[0]} {...shared} />;
  return <TicketRing tickets={tickets} {...shared} />;
}

function TicketRing({ tickets, ...shared }: { tickets: Ticket[] } & Shared) {
  const n = tickets.length;
  // `turn` only ever counts up or down, so the ring keeps spinning the way the guest pushed it (no unwinding at the seam).
  const [turn, setTurn] = useState(0);
  const start = useRef<number | null>(null);
  const active = mod(turn, n);
  const step = 360 / n;
  // Wide enough that neighbouring cards on the ring do not overlap, and never so tight it looks flat.
  const radius = Math.max(300, (CARD_W / 2 + 40) / Math.tan(Math.PI / n));

  const go = (d: number) => setTurn((t) => t + d);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
  };
  const onDown = (e: PointerEvent) => {
    start.current = e.clientX;
  };
  const onUp = (e: PointerEvent) => {
    if (start.current === null) return;
    const dx = e.clientX - start.current;
    start.current = null;
    if (Math.abs(dx) > SWIPE_PX) go(dx < 0 ? 1 : -1);
  };

  const current = tickets[active];
  return (
    <section aria-roledescription="carousel" aria-label="Your tickets" onKeyDown={onKey} className="flex flex-col items-center">
      <p className="m-0 mt-6 text-sm font-semibold tracking-wide text-[#E6E3DA]" aria-live="polite">
        Ticket {active + 1} of {n}
      </p>

      <div
        className="relative w-full overflow-x-clip"
        style={{ height: STAGE_H, perspective: 1100, touchAction: "pan-y" }}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerCancel={() => (start.current = null)}
      >
        <div
          className="o26-ring absolute left-1/2 top-4"
          style={{
            width: CARD_W,
            height: 390,
            marginLeft: -CARD_W / 2,
            transformStyle: "preserve-3d",
            transform: `translateZ(${-radius}px) rotateY(${-turn * step}deg)`,
          }}
        >
          {tickets.map((t, i) => {
            const front = i === active;
            // Cards round the back of the ring fade out so only the one coming round and the one leaving stay in view.
            const dist = Math.min(mod(i - active, n), mod(active - i, n));
            return (
              <div
                key={t.seatLabel}
                role="group"
                aria-roledescription="slide"
                aria-label={`Ticket ${i + 1} of ${n}`}
                className="o26-ring-card absolute inset-0"
                style={{
                  transform: `rotateY(${i * step}deg) translateZ(${radius}px)`,
                  opacity: front ? 1 : dist === 1 ? 0.28 : 0,
                  pointerEvents: front ? "auto" : "none",
                  backfaceVisibility: "hidden",
                }}
              >
                <TicketFace qr={t.qr} seatLabel={t.seatLabel} eventName={shared.eventName} shortDate={shared.shortDate} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-5">
        <button type="button" onClick={() => go(-1)} aria-label="Previous ticket" className="o26-ring-btn">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <div className="flex gap-2" role="tablist" aria-label="Choose a ticket">
          {tickets.map((t, i) => (
            <button
              key={t.seatLabel}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={`Show ticket ${i + 1}`}
              onClick={() => go(shortest(i, active, n))}
              className={`h-2.5 rounded-full transition-all ${i === active ? "w-6 bg-[#F9A90B]" : "w-2.5 bg-[#FDFBF4]/35"}`}
            />
          ))}
        </div>
        <button type="button" onClick={() => go(1)} aria-label="Next ticket" className="o26-ring-btn o26-ring-btn-next">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      <div key={current.seatLabel} className="o26-ticket-in mt-8 flex w-full justify-center">
        <TicketDetails qr={current.qr} seatLabel={current.seatLabel} tierName={current.tierName} {...shared} />
      </div>
    </section>
  );
}

/** Signed number of steps from `from` to `to` going the shorter way round a ring of `n`. */
function shortest(to: number, from: number, n: number): number {
  const d = mod(to - from, n);
  return d > n / 2 ? d - n : d;
}
