/**
 * ONE·26 Rekindle "fire vortex" loader, ported from the design's one26-vortex.js.
 * The eight flame layers whirl around the logo like a fire tornado, the RE·KINDLE letters turn with
 * them, then everything slows, twists back into place and burns as the logo before whirling out again.
 * Loops every 5.2 s. Layers are the logo pack's PNGs in /landing/logo.
 */

type Layer = { x: number; y: number; w: number; h: number; file: string };
type Part = Layer & {
  amp: number; freq: number; k: number; phase: number; stretch: number; tip: number; base: number;
  img?: HTMLImageElement;
  oc?: HTMLCanvasElement;
  octx?: CanvasRenderingContext2D;
  beta?: number; hx?: number; hy?: number; lift?: number;
  glow?: HTMLCanvasElement; gpad?: number;
};

const TAU = Math.PI * 2;
const LW = 1400, LH = 1380; // logical drawing size
const OX = (LW - 1033) / 2, OY = (LH - 1177) / 2 + 20;
const CX = OX + 516.5, CY = OY + 600; // logo centre
/** Loop length in seconds. */
export const VORTEX_LOOP = 5.2;
const T = VORTEX_LOOP;
const V = 3 / 2.8; // spin speed so each whirl lands after exactly 3 turns
const R = 380; // radius of the whirl
const TP = 110, SP = 150; // padding around each flame for its sway, lick and bend
const BASE = "/landing/logo/";

const PARTS: Part[] = [
  { file: "01-flame-crown-amber.png", x: 420, y: 22, w: 187, h: 397, amp: 5, freq: 1.1, k: 0.6, phase: 0.0, stretch: 0.025, tip: 23, base: 418 },
  { file: "02-flame-amber-left.png", x: 233, y: 254, w: 202, h: 477, amp: 18, freq: 1.6, k: 1.0, phase: 1.7, stretch: 0.05, tip: 255, base: 730 },
  { file: "03-flame-amber-right.png", x: 638, y: 296, w: 293, h: 525, amp: 20, freq: 1.4, k: 1.1, phase: 3.9, stretch: 0.05, tip: 296, base: 820 },
  { file: "04-flame-red-crown.png", x: 545, y: 154, w: 142, h: 366, amp: 15, freq: 1.9, k: 0.9, phase: 2.6, stretch: 0.06, tip: 155, base: 518 },
  { file: "05-flame-red-left.png", x: 97, y: 391, w: 204, h: 384, amp: 16, freq: 1.7, k: 1.0, phase: 5.1, stretch: 0.05, tip: 392, base: 772 },
  { file: "06-flame-teal-right.png", x: 767, y: 406, w: 244, h: 612, amp: 14, freq: 1.2, k: 0.8, phase: 0.9, stretch: 0.035, tip: 407, base: 1016 },
  { file: "07-flame-teal-left.png", x: 22, y: 474, w: 193, h: 451, amp: 14, freq: 1.3, k: 0.8, phase: 4.4, stretch: 0.035, tip: 475, base: 924 },
  { file: "08-flame-teal-small.png", x: 861, y: 487, w: 145, h: 244, amp: 12, freq: 2.1, k: 0.9, phase: 2.2, stretch: 0.05, tip: 489, base: 729 },
];
const LETTERS: Layer = { file: "09-base-letters-and-waves.png", x: 67, y: 438, w: 888, h: 717 };

function ease(x: number) {
  x = Math.max(0, Math.min(1, x));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** u: seconds since the logo finished burning and started to whirl out. */
function phase(t: number) {
  const u = (((t - 4.4) % T) + T) % T;
  let phi: number, m: number;
  if (u < 0.8) { phi = (V * u * u) / 1.6; m = ease(u / 0.8); }
  else if (u < 2.6) { phi = V * (0.4 + (u - 0.8)); m = 1; }
  else if (u < 3.8) { const d = u - 2.6; phi = V * (2.2 + d - (d * d) / 2.4); m = 1 - ease(d / 1.2); }
  else { phi = 0; m = 0; }
  return { phi: phi * TAU, m, hold: u >= 3.8, u };
}

function loadImage(file: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(im); // a missing layer just doesn't draw
    im.src = BASE + file;
  });
}

type Options = {
  /** Draw one still frame (the burning logo) instead of animating. */
  still?: boolean;
  /** Called once per frame with whether the logo is whole and burning (the end of each loop). */
  onFrame?: (hold: boolean) => void;
};

/** Starts the vortex on a canvas; returns a function that stops it. */
export function startVortex(canvas: HTMLCanvasElement, { still = false, onFrame }: Options = {}): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const parts: Part[] = PARTS.map((p) => ({ ...p }));
  let dead = false;
  let raf = 0;
  let t0 = 0;
  const letters: Layer & { img?: HTMLImageElement } = { ...LETTERS };
  const canBlur = typeof ctx.filter === "string";

  parts.forEach((p, i) => {
    const oc = document.createElement("canvas");
    oc.width = p.w + SP * 2;
    oc.height = p.h + TP;
    p.oc = oc;
    p.octx = oc.getContext("2d")!;
    p.beta = (i * TAU) / parts.length + 0.35;
    p.hx = p.x + p.w / 2 - 516.5;
    p.hy = p.y + p.h / 2 - 600;
    p.lift = -70 + 90 * Math.sin(p.beta * 2 + 1);
  });

  function fit() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (w && h && (canvas.width !== w || canvas.height !== h)) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  // One flame tongue, redrawn row by row: a wave travels up it (tip moves most, base stays rooted),
  // fine turbulence like heat shimmer, a drag bend as it is swung round the whirl, and a helix twist.
  function tongue(p: Part, t: number, energy: number, o: { m: number; bend: number; tw: number; twa: number }) {
    const c = p.octx!;
    c.clearRect(0, 0, p.oc!.width, p.oc!.height);
    const H = p.base - p.tip;
    const flick = 0.6 + 0.25 * Math.sin(t * 13.1 + p.phase * 3) * Math.sin(t * 7.3 + p.phase) + 0.15 * Math.sin(t * 23 + p.phase);
    const lick = p.stretch * H * (0.55 + 0.45 * Math.sin(TAU * 0.8 * p.freq * t + p.phase)) * energy * (1 + o.m * 1.6) * flick * 1.6;
    let below: number | null = null;
    for (let r = p.h - 1; r >= 0; r--) {
      const y = p.y + r;
      const h = Math.min(1, Math.max(0, (p.base - y) / H));
      const f = Math.pow(h, 1.6);
      let dx = p.amp * energy * f * (
        Math.sin(TAU * (p.k * h - p.freq * t) + p.phase) +
        0.35 * Math.sin(TAU * (1.7 * p.k * h - 2.3 * p.freq * t) + 1.9 * p.phase) +
        0.22 * (1 + o.m) * Math.sin(TAU * (3.3 * p.k * h - 3.9 * p.freq * t) + 2.7 * p.phase));
      dx += o.bend * Math.pow(h, 1.35);
      let ws = 1;
      if (o.m > 0.01) {
        const tw = Math.abs(Math.cos(o.tw + h * o.twa));
        ws = 1 - o.m * 0.62 * (1 - tw);
      }
      const top = Math.round(TP + r - lick * h);
      const bottom: number = below === null ? top + 1 : below;
      if (bottom > top) {
        c.globalAlpha = 1 - f * 0.4 * (0.3 + 0.7 * o.m) * energy * (0.5 + 0.5 * Math.sin(t * 11 + h * 9 + p.phase * 2));
        const rw = p.w * ws;
        c.drawImage(p.img!, 0, r, p.w, 1, SP + dx + (p.w - rw) / 2, top, rw, bottom - top);
      }
      below = top;
    }
    c.globalAlpha = 1;
  }

  function drawAt(t: number, now: number) {
    const w = canvas.width, h = canvas.height;
    ctx!.setTransform(1, 0, 0, 1, 0, 0);
    ctx!.imageSmoothingQuality = "high";
    ctx!.clearRect(0, 0, w, h);
    const k = Math.min(w / LW, h / LH);
    ctx!.setTransform(k, 0, 0, k, (w - LW * k) / 2, (h - LH * k) / 2);
    const ph = phase(t), m = ph.m, phi = ph.phi;
    const fade = Math.min(1, t / 0.6);

    // warm glow behind the logo, brighter while it burns
    const g = ph.hold ? 0.55 + 0.15 * Math.sin(now * 3.2) : 0.35 + 0.25 * m;
    const grad = ctx!.createRadialGradient(CX, CY, 20, CX, CY, 620);
    grad.addColorStop(0, `rgba(255,110,30,${0.42 * g * fade})`);
    grad.addColorStop(0.5, `rgba(255,69,32,${0.16 * g * fade})`);
    grad.addColorStop(1, "rgba(255,69,32,0)");
    ctx!.fillStyle = grad;
    ctx!.fillRect(0, 0, LW, LH);

    // swirl ring while whirling
    if (m > 0.02) {
      ctx!.save();
      ctx!.globalAlpha = 0.28 * m * fade;
      ctx!.strokeStyle = "#F9A90B";
      ctx!.lineWidth = 3;
      for (let a = 0; a < 3; a++) {
        ctx!.beginPath();
        ctx!.ellipse(CX, CY + 60 - a * 140, R * (1.05 - a * 0.12), 60 - a * 10, 0, phi + a, phi + a + 2.2);
        ctx!.stroke();
      }
      ctx!.restore();
    }

    // place every layer on the whirl, mixed with its home position by m
    type Item = { z: number; x: number; y: number; sx: number; sy: number; rot: number; a: number; bend: number; tw: number; twa: number; p?: Part; letters?: boolean };
    const items: Item[] = [];
    const cosP = Math.cos(phi), sinP = Math.sin(phi);
    let omega = (phase(t + 0.02).phi - phi) / 0.02; // spin speed, rad/s
    if (!isFinite(omega) || Math.abs(omega) > 40) omega = 0;
    parts.forEach((p, i) => {
      const X = p.hx! + (R * Math.cos(p.beta!) - p.hx!) * m;
      const Z = R * Math.sin(p.beta!) * m;
      const Y = p.hy! + p.lift! * m;
      const xr = X * cosP + Z * sinP, zr = -X * sinP + Z * cosP;
      const persp = 1300 / (1300 - zr);
      const vx = zr * omega; // how fast it swings sideways on screen
      items.push({
        p, z: zr + i * 0.001, x: CX + xr * persp, y: CY + Y * persp,
        sx: persp * (1 - 0.15 * m), sy: persp * (1 - 0.15 * m) * (1 + 0.12 * m),
        rot: m * 0.28 * Math.sin(phi + p.beta!) - Math.max(-0.35, Math.min(0.35, vx * 0.00018)),
        bend: -Math.max(-130, Math.min(130, vx * 0.05)) * m,
        tw: phi + p.beta!, twa: 2.4 * m,
        a: 1 - m * 0.4 * Math.max(0, Math.min(1, -zr / R)),
      });
    });
    const ls = 1 - 0.28 * m;
    items.push({
      letters: true, z: 0.5, x: CX + (letters.x + letters.w / 2 - 516.5) * (1 - m),
      y: CY + (letters.y + letters.h / 2 - 600) * ls + Math.sin(now * 2) * 6 * m,
      sx: ls * Math.cos(phi), sy: ls, rot: 0, a: 1, bend: 0, tw: 0, twa: 0,
    });
    items.sort((A, B) => A.z - B.z);

    const energy = ph.hold ? 0.8 : 1 + 0.7 * m;
    items.forEach((it) => {
      ctx!.save();
      ctx!.globalAlpha = it.a * fade;
      ctx!.translate(it.x, it.y);
      ctx!.rotate(it.rot);
      ctx!.scale(it.sx, it.sy);
      if (it.letters) {
        if (it.sx < 0) ctx!.filter = "brightness(0.72)";
        ctx!.drawImage(letters.img!, -letters.w / 2, -letters.h / 2);
      } else {
        const p = it.p!;
        tongue(p, now, energy, { m, bend: it.bend, tw: it.tw, twa: it.twa });
        ctx!.drawImage(p.oc!, -p.w / 2 - SP, -p.h / 2 - TP);
        if (p.glow) {
          ctx!.globalCompositeOperation = "lighter";
          ctx!.globalAlpha = it.a * fade * (0.1 + 0.34 * m) * (0.85 + 0.15 * Math.sin(now * 9 + p.phase));
          ctx!.drawImage(p.glow, -p.w / 2 - p.gpad! + it.bend * 0.35, -p.h / 2 - p.gpad!);
          ctx!.globalCompositeOperation = "source-over";
        }
      }
      ctx!.restore();
    });

    // embers spiralling up through the fire
    for (let j = 0; j < 54; j++) {
      const L = 1.9 + (j % 5) * 0.25;
      const age = (((now + j * 0.173) % L) + L) % L, q = age / L;
      const ang = j * 2.399 + now * (1.5 + 4 * m) + q * 2;
      const rad = (90 + ((j * 37) % 220)) * (0.45 + 0.9 * m) * (1 - 0.4 * q);
      const ex = CX + rad * Math.sin(ang), ey = CY + 380 - q * 980;
      const depth = Math.cos(ang);
      ctx!.globalAlpha = Math.sin(Math.PI * q) * (0.45 + 0.35 * depth) * fade;
      ctx!.fillStyle = j % 3 ? "#F9A90B" : "#FF4520";
      ctx!.beginPath();
      ctx!.arc(ex, ey, 2.5 + (j % 4) * 1.4, 0, TAU);
      ctx!.fill();
    }
    ctx!.globalAlpha = 1;
    return ph;
  }

  const onResize = () => fit();
  fit();
  window.addEventListener("resize", onResize, { passive: true });

  Promise.all([...parts, letters].map((l) => loadImage(l.file))).then((imgs) => {
    if (dead) return;
    parts.forEach((p, i) => { p.img = imgs[i]; });
    letters.img = imgs[parts.length];
    // a soft, blurred copy of each flame, added on top as glowing light
    if (canBlur) {
      parts.forEach((p) => {
        const G = 60;
        const g = document.createElement("canvas");
        g.width = p.w + G * 2;
        g.height = p.h + G * 2;
        const gc = g.getContext("2d")!;
        gc.filter = "blur(22px)";
        gc.drawImage(p.img!, G, G);
        p.glow = g;
        p.gpad = G;
      });
    }
    if (still) {
      drawAt(8.6, 0); // the whole, burning logo
      return;
    }
    const loop = (nowMs: number) => {
      if (dead) return;
      raf = requestAnimationFrame(loop);
      if (!t0) t0 = nowMs - 0.15 * 1000 - 4400;
      const ph = drawAt((nowMs - t0) / 1000 - 4.4, nowMs / 1000);
      onFrame?.(ph.hold);
    };
    raf = requestAnimationFrame(loop);
  });

  return () => {
    dead = true;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
  };
}
