"use client";

import { useEffect, useRef } from "react";

/**
 * Living ONE·26 Rekindle logo. Only the eight flame tongues move: each is redrawn row by row
 * with a wave that travels up it (tip sways most, base stays rooted). The letters and base
 * waves never move. On mount a fire front climbs from the bottom and the flames ramp up.
 * Ported from the logo pack's one26-flame.js; per-tongue values come from its layers.json.
 */

const CANVAS = { width: 1033, height: 1177 };
const PAD = 30; // logo px of room for tips swinging past the logo's edge
const TAU = Math.PI * 2;
const SOFT = 240; // height of the fire front's soft edge
const IGNITE_SECONDS = 1.25;
const RAMP_SECONDS = 0.6;

const BASE_URL = "/landing/logo";

type Part = { x: number; y: number; w: number; h: number; file: string };
type Tongue = Part & { amp: number; freq: number; k: number; phase: number; stretch: number; tip: number; base: number };

const STATIC: Part = { x: 67, y: 438, w: 888, h: 717, file: "09-base-letters-and-waves.png" };

const TONGUES: Tongue[] = [
  { file: "01-flame-crown-amber.png", x: 420, y: 22, w: 187, h: 397, amp: 5, freq: 1.1, k: 0.6, phase: 0.0, stretch: 0.025, tip: 23, base: 418 },
  { file: "02-flame-amber-left.png", x: 233, y: 254, w: 202, h: 477, amp: 18, freq: 1.6, k: 1.0, phase: 1.7, stretch: 0.05, tip: 255, base: 730 },
  { file: "03-flame-amber-right.png", x: 638, y: 296, w: 293, h: 525, amp: 20, freq: 1.4, k: 1.1, phase: 3.9, stretch: 0.05, tip: 296, base: 820 },
  { file: "04-flame-red-crown.png", x: 545, y: 154, w: 142, h: 366, amp: 15, freq: 1.9, k: 0.9, phase: 2.6, stretch: 0.06, tip: 155, base: 518 },
  { file: "05-flame-red-left.png", x: 97, y: 391, w: 204, h: 384, amp: 16, freq: 1.7, k: 1.0, phase: 5.1, stretch: 0.05, tip: 392, base: 772 },
  { file: "06-flame-teal-right.png", x: 767, y: 406, w: 244, h: 612, amp: 14, freq: 1.2, k: 0.8, phase: 0.9, stretch: 0.035, tip: 407, base: 1016 },
  { file: "07-flame-teal-left.png", x: 22, y: 474, w: 193, h: 451, amp: 14, freq: 1.3, k: 0.8, phase: 4.4, stretch: 0.035, tip: 475, base: 924 },
  { file: "08-flame-teal-small.png", x: 861, y: 487, w: 145, h: 244, amp: 12, freq: 2.1, k: 0.9, phase: 2.2, stretch: 0.05, tip: 489, base: 729 },
];

function loadImage(file: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `${BASE_URL}/${file}`;
  });
}

function drawTongue(ctx: CanvasRenderingContext2D, p: Tongue, img: HTMLImageElement, t: number, energy: number) {
  // Walk from the base upward so each row's height spans exactly to the row below it.
  const H = p.base - p.tip;
  const lickPhase = Math.sin(TAU * 0.8 * p.freq * t + p.phase);
  const lick = p.stretch * H * (0.55 + 0.45 * lickPhase) * energy;
  let below: number | null = null;
  for (let r = p.h - 1; r >= 0; r--) {
    const y = p.y + r;
    const h = Math.min(1, Math.max(0, (p.base - y) / H));
    const f = Math.pow(h, 1.6);
    const dx =
      p.amp * energy * f *
      (Math.sin(TAU * (p.k * h - p.freq * t) + p.phase) +
        0.35 * Math.sin(TAU * (1.7 * p.k * h - 2.3 * p.freq * t) + 1.9 * p.phase));
    const top = Math.round(PAD + y - lick * h);
    const bottom = below === null ? top + 1 : below;
    if (bottom > top) ctx.drawImage(img, 0, r, p.w, 1, PAD + p.x + dx, top, p.w, bottom - top);
    below = top;
  }
}

/** Everything below the front is alight, a soft gradient above it fades out, and a hot band glows just behind it. */
function burnIn(ctx: CanvasRenderingContext2D, width: number, height: number, reveal: number) {
  const front = height - reveal * (height + SOFT);
  ctx.globalCompositeOperation = "destination-in";
  const mask = ctx.createLinearGradient(0, front - SOFT, 0, front);
  mask.addColorStop(0, "rgba(0,0,0,0)");
  mask.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "source-atop";
  const hot = ctx.createLinearGradient(0, front - SOFT, 0, front + SOFT * 0.8);
  hot.addColorStop(0, "rgba(255,236,170,0)");
  hot.addColorStop(0.35, "rgba(255,226,140,0.85)");
  hot.addColorStop(0.6, "rgba(255,170,60,0.45)");
  hot.addColorStop(1, "rgba(255,120,30,0)");
  ctx.fillStyle = hot;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";
}

type Props = {
  className?: string;
  /** Play the fire-front ignite on mount. When false the logo is lit straight away. */
  ignite?: boolean;
  /** Change this value to replay the ignite. */
  replayKey?: number;
  /** Soft orange glow behind the logo, as in the pack's demo page. */
  glow?: boolean;
};

export function FlameLogo({ className, ignite = true, replayKey = 0, glow = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.imageSmoothingEnabled = true;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let visible = true;
    let cancelled = false;
    let start = performance.now();

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !raf && images) raf = requestAnimationFrame(frame);
    });
    io.observe(canvas);

    let images: HTMLImageElement[] | null = null;
    const staticImg = () => images![0];

    function draw(t: number, energy: number, reveal: number) {
      const { width, height } = canvas!;
      ctx!.clearRect(0, 0, width, height);
      if (reveal <= 0) return;
      TONGUES.forEach((p, i) => drawTongue(ctx!, p, images![i + 1], t, energy));
      ctx!.drawImage(staticImg(), PAD + STATIC.x, PAD + STATIC.y);
      if (reveal < 1) burnIn(ctx!, width, height, reveal);
    }

    function frame(now: number) {
      raf = 0;
      if (cancelled || !visible) return;
      const t = (now - start) / 1000;
      const r = ignite ? Math.min(1, t / IGNITE_SECONDS) : 1;
      const reveal = r * r * (3 - 2 * r);
      const energy = reduceMotion ? 0 : Math.min(1, t / RAMP_SECONDS);
      draw(now / 1000, energy, reveal);
      // Reduced motion: one still frame once lit, no loop.
      if (reduceMotion && reveal >= 1) return;
      raf = requestAnimationFrame(frame);
    }

    Promise.all([STATIC, ...TONGUES].map((p) => loadImage(p.file)))
      .then((loaded) => {
        if (cancelled) return;
        images = loaded;
        start = performance.now();
        raf = requestAnimationFrame(frame);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [ignite, replayKey]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="ONE·26 Rekindle logo, burning"
      className={className}
      width={CANVAS.width + PAD * 2}
      height={CANVAS.height + PAD * 2}
      style={{
        display: "block",
        width: "100%",
        height: "auto",
        aspectRatio: `${CANVAS.width + PAD * 2} / ${CANVAS.height + PAD * 2}`,
        filter: glow ? "drop-shadow(0 0 30px rgba(255,100,20,.35))" : undefined,
      }}
    />
  );
}
