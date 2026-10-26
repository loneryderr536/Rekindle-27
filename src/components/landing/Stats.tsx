"use client";

import { useEffect, useRef, useState } from "react";

const COUNT_MS = 1600;

/** Days to go, seats and nights; the numbers count up the first time the cards scroll into view. */
export function Stats({ days, seats }: { days: number; seats: number | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);

  useEffect(() => {
    let raf = 0;
    const el = ref.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!el || reduce || !("IntersectionObserver" in window)) {
      raf = requestAnimationFrame(() => setP(1));
      return () => cancelAnimationFrame(raf);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const start = performance.now();
        const tick = (t: number) => {
          const next = Math.max(0, Math.min(1, (t - start) / COUNT_MS));
          setP(next);
          if (next < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  const e = 1 - Math.pow(1 - p, 3);
  return (
    <div className="o26-wrap o26-stats-wrap">
      <div id="stats" ref={ref}>
        <div style={{ background: "#F9A90B", color: "#0B1020" }}>
          <span className="o26-stat-n o26-ff-fredoka">{Math.round(days * e)}</span>
          <span className="o26-stat-l">Days to go</span>
        </div>
        <div style={{ background: "#0A5470", color: "#FDFBF4" }}>
          <span className="o26-stat-n o26-ff-fredoka">{seats === null ? "—" : Math.round(seats * e).toLocaleString("en-IN")}</span>
          <span className="o26-stat-l">Seats</span>
        </div>
        <div style={{ background: "#0B1020", color: "#FDFBF4" }}>
          <span className="o26-stat-n o26-ff-fredoka" style={{ color: "#F9A90B" }}>1</span>
          <span className="o26-stat-l">Night</span>
        </div>
      </div>
    </div>
  );
}
