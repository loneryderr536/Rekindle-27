/**
 * The snapping boy: a canvas port of the ONE·26 pack's boy-animation.js (same numbers, same timeline).
 * It has no clock of its own: the story calls seek(t) with the time into the boy's 6.6 s, so scrolling scrubs it.
 *
 * Timeline (seconds): 0–1.45 rises, 1.25 blinks, 1.40–2.80 leans in, 1.80–3.90 camera pushes in on the hand,
 * 3.40–4.20 sparks flicker, 4.30 SNAP (ring, rays, flash, shake), 4.80–6.40 fades with the night, always breathing.
 */

const WORLD_H = 1080;
/** Where the 3792 × 3792 boy frames sit in the 1920 × 1080 world. */
const BOY_X = 479, BOY_Y = 54, BOY_SIZE = 1099.68, SRC = 3792, K = BOY_SIZE / SRC;
const BLINK_BOX = [894, 1128, 1723, 1405]; // in 3792-px frame coordinates
const PIVOT = [900, 1330]; // lean / breath pivot (hips), world units
const CAM = { scale: 2.0, x: -1870, y: 215 }; // the push-in
const SNAP_T = 4.3;
export const BOY_DURATION = 6.6;

type EaseName = "none" | "sineIn" | "sineOut" | "sineInOut" | "p1InOut" | "p2In" | "p2Out" | "p2InOut" | "p3Out";
type Keys = [number, number, EaseName?][];

const EASE: Record<EaseName, (p: number) => number> = {
  none: (p) => p,
  sineIn: (p) => 1 - Math.cos((p * Math.PI) / 2),
  sineOut: (p) => Math.sin((p * Math.PI) / 2),
  sineInOut: (p) => -(Math.cos(Math.PI * p) - 1) / 2,
  p1InOut: (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2),
  p2In: (p) => p * p * p,
  p2Out: (p) => 1 - Math.pow(1 - p, 3),
  p2InOut: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  p3Out: (p) => 1 - Math.pow(1 - p, 4),
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Value of a chain of keys [[time, value, ease], ...] at time t. */
function track(keys: Keys, t: number): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t <= b[0]) {
      const p = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * EASE[b[2] ?? "none"](clamp01(p));
    }
  }
  return keys[keys.length - 1][1];
}

const TRACKS = {
  lean: [[1.4, 0], [2.2, -1.6, "sineOut"], [2.8, -0.6, "sineInOut"], [3.98, -0.6], [4.28, -1.2, "p2In"], [4.3, -1.2], [4.55, 0.4, "p2Out"]] as Keys,
  cam: [[1.8, 0], [3.9, 1, "p2InOut"]] as Keys,
  fade: [[4.8, 1], [6.4, 0, "p1InOut"]] as Keys,
  ringS: [[SNAP_T, 0.4], [SNAP_T + 0.4, 3.4, "p3Out"]] as Keys,
  ringA: [[SNAP_T, 1], [SNAP_T + 0.4, 0, "p3Out"]] as Keys,
  lineS: [[SNAP_T, 0.4], [SNAP_T + 0.35, 1.25, "p3Out"]] as Keys,
  lineA: [[SNAP_T, 1], [SNAP_T + 0.35, 0, "p3Out"]] as Keys,
  flash: [[SNAP_T, 0], [SNAP_T + 0.05, 0.18], [SNAP_T + 0.3, 0, "p2Out"]] as Keys,
  shakeX: [[SNAP_T + 0.02, 0], [SNAP_T + 0.06, 6], [SNAP_T + 0.11, -6], [SNAP_T + 0.16, 3], [SNAP_T + 0.22, 0]] as Keys,
  shakeY: [[SNAP_T + 0.02, 0], [SNAP_T + 0.06, -4], [SNAP_T + 0.11, 3], [SNAP_T + 0.16, -2], [SNAP_T + 0.22, 0]] as Keys,
};
const BLINKS = [[1.25, 1.35], [2.95, 3.03]];
const SPARKS: [number, number, number, string][] = [[1338, 196, 5, "#F9A90B"], [1292, 200, 4, "#F9A90B"], [1322, 176, 3.5, "#F9A90B"], [1350, 222, 3, "#F9A90B"], [1300, 182, 2.5, "#FF4520"]];
const RAYS = [[960, 640, 960, 560], [1045, 675, 1102, 618], [1080, 760, 1160, 760], [875, 675, 818, 618], [840, 760, 760, 760], [1045, 845, 1102, 902], [875, 845, 818, 902]];

export type BoyHandle = {
  /** Draw the boy at `t` seconds into his animation (0–6.6). */
  seek: (t: number) => void;
  /** Extra world units of scene below the 1080 frame (tall phone screens), so he starts fully out of view. */
  setExtra: (extra: number) => void;
  destroy: () => void;
};

export function createBoyAnimation(canvas: HTMLCanvasElement, basePath: string): BoyHandle {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { seek() {}, setExtra() {}, destroy() {} };
  const g = ctx;

  const load = (name: string) => {
    const im = new Image();
    im.decoding = "async";
    im.src = `${basePath}/${name}`;
    return im;
  };
  const IM = { ready: load("boy-ready.webp"), snap: load("boy-snap.webp"), blink: load("boy-blink.webp") };

  let time = 0;
  let extra = 0;
  let destroyed = false;

  /** Canvas backing size follows its on-screen size (the story scales the whole scene with a CSS transform). */
  function size(): [number, number] {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round((r.width || canvas.width) * dpr));
    const h = Math.max(1, Math.round((r.height || canvas.height) * dpr));
    if (r.width && (canvas.width !== w || canvas.height !== h)) {
      canvas.width = w;
      canvas.height = h;
    }
    return [canvas.width, canvas.height];
  }

  /** Fit the 1920×1080 world like the story does: at least 1100 world-px wide, centred both ways. */
  function fit(cw: number, ch: number): [number, number, number] {
    const visibleW = Math.max(1100, (WORLD_H * cw) / ch);
    const s = cw / visibleW;
    return [s, cw / 2 - 960 * s, ch / 2 - 540 * s];
  }

  function render(t: number) {
    time = t;
    const [cw, ch] = size();
    const [s, fx, fy] = fit(cw, ch);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cw, ch);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    const alpha = track(TRACKS.fade, t);
    const sx = t > SNAP_T ? track(TRACKS.shakeX, t) : 0;
    const sy = t > SNAP_T ? track(TRACKS.shakeY, t) : 0;
    const c = track(TRACKS.cam, t);
    const cs = 1 + (CAM.scale - 1) * c, cx = CAM.x * c, cy = CAM.y * c;
    const boyY = track([[0, 1280 + extra], [1.45, 60, "sineInOut"]], t);
    g.setTransform(s, 0, 0, s, fx, fy);
    g.translate(sx, sy);

    // Inside the camera: the boy, leaning and breathing from the hips.
    g.save();
    g.translate(cx, cy);
    g.scale(cs, cs);
    g.translate(0, boyY);
    const br = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 3.8);
    g.translate(PIVOT[0], PIVOT[1]);
    g.rotate((track(TRACKS.lean, t) * Math.PI) / 180);
    g.scale(1 + 0.004 * br, 1 + 0.012 * br);
    g.translate(-PIVOT[0], -PIVOT[1]);
    const snapped = t >= SNAP_T;
    const frame = snapped ? IM.snap : IM.ready;
    if (alpha > 0.001 && frame.naturalWidth) {
      g.globalAlpha = alpha;
      g.drawImage(frame, BOY_X, BOY_Y, BOY_SIZE, BOY_SIZE);
      const blinking = !snapped && BLINKS.some(([a, b]) => t >= a && t < b);
      if (blinking && IM.blink.naturalWidth) {
        g.drawImage(IM.blink, BOY_X + BLINK_BOX[0] * K, BOY_Y + BLINK_BOX[1] * K, (BLINK_BOX[2] - BLINK_BOX[0]) * K, (BLINK_BOX[3] - BLINK_BOX[1]) * K);
      }
    }
    g.restore();

    // Sparks ride with the camera but not the lean, so they stay on the fingertips.
    if (t >= 3.4 && t < SNAP_T) {
      const flick = t >= 4.2 || Math.floor((t - 3.4) / 0.08) % 2 === 0;
      if (flick) {
        g.save();
        g.translate(cx, cy);
        g.scale(cs, cs);
        g.translate(0, boyY - 72);
        g.globalAlpha = alpha;
        SPARKS.forEach(([x, y, r, color]) => {
          g.fillStyle = color;
          g.beginPath();
          g.arc(x, y, r, 0, 6.2832);
          g.fill();
        });
        g.restore();
      }
    }

    // Snap ring and rays, fixed to the screen in world units.
    if (t >= SNAP_T && t < SNAP_T + 0.45) {
      g.save();
      g.globalAlpha = track(TRACKS.ringA, t);
      const rs = track(TRACKS.ringS, t);
      g.strokeStyle = "#FF4520";
      g.lineWidth = 14 * rs;
      g.beginPath();
      g.arc(960, 760, 40 * rs, 0, 6.2832);
      g.stroke();
      g.globalAlpha = track(TRACKS.lineA, t);
      const ls = track(TRACKS.lineS, t);
      g.translate(960, 760);
      g.scale(ls, ls);
      g.translate(-960, -760);
      g.strokeStyle = "#F9A90B";
      g.lineWidth = 12;
      g.lineCap = "round";
      RAYS.forEach(([x1, y1, x2, y2]) => {
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke();
      });
      g.restore();
    }

    const fl = track(TRACKS.flash, t);
    if (fl > 0.001 && t >= SNAP_T) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = fl;
      g.fillStyle = "#FFB347";
      g.fillRect(0, 0, cw, ch);
    }
    g.globalAlpha = 1;
  }

  // Pictures finish decoding after the first seek: draw again once they are in.
  Promise.all(Object.values(IM).map((im) => im.decode().catch(() => {}))).then(() => {
    if (!destroyed) render(time);
  });

  return {
    seek: (t) => render(Math.max(0, Math.min(BOY_DURATION, t))),
    setExtra: (e) => {
      extra = e;
    },
    destroy: () => {
      destroyed = true;
    },
  };
}
