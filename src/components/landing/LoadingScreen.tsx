"use client";

import { useEffect, useRef } from "react";
import { startVortex } from "@/components/landing/vortex";

const STARS: [number, number, number][] = [[140, 120, 2], [420, 70, 1.5], [1020, 110, 2], [1310, 210, 1.5], [1220, 760, 2], [260, 700, 1.5], [90, 420, 1.5], [1380, 480, 2]];

type Props = {
  /** The line under the title; defaults to the design's "Lighting the fire". */
  message?: string;
  /** A small line under the bar saying what is happening. */
  note?: string;
  /** Set once the work is done: onSettled fires when the logo is next whole and burning. */
  done?: boolean;
  onSettled?: () => void;
};

/**
 * The full-screen loading screen: textured night sky with stars and the fire-vortex logo
 * whirling and settling into the burning logo, ONE·26 · REKINDLE, a bouncing-dot caption and a sliding bar.
 */
export function LoadingScreen({ message = "Lighting the fire", note, done = false, onSettled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef(done);
  const settledRef = useRef(onSettled);

  useEffect(() => {
    doneRef.current = done;
    settledRef.current = onSettled;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let fired = false;
    return startVortex(canvas, {
      still,
      onFrame: (hold) => {
        if (hold && doneRef.current && !fired) {
          fired = true;
          settledRef.current?.();
        }
      },
    });
  }, []);

  return (
    <div role="status" aria-live="polite" aria-label="Loading ONE·26 Rekindle" className="o26-loading">
      <svg aria-hidden="true" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" className="o26-loading-sky">
        <g fill="#FDFBF4">
          {STARS.map(([cx, cy, r]) => (
            <circle key={`${cx}-${cy}`} className="ld-star" cx={cx} cy={cy} r={r} />
          ))}
        </g>
      </svg>
      <canvas ref={canvasRef} aria-hidden="true" className="o26-loading-canvas" />
      <div className="ld-in o26-loading-text">
        <span className="o26-loading-eyebrow">ONE·26 · REKINDLE</span>
        <span className="o26-ff-fredoka o26-loading-line">
          {message}
          <span className="ld-dot">.</span>
          <span className="ld-dot">.</span>
          <span className="ld-dot">.</span>
        </span>
        <div aria-hidden="true" className="o26-loading-track">
          <div className="ld-bar" />
        </div>
        {note && <span className="o26-loading-note">{note}</span>}
      </div>
    </div>
  );
}
