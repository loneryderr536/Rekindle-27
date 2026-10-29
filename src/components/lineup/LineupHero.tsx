"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";

type Artist = {
  name: string;
  role: string;
  bio: string;
  /** Backgrounds of the three photo placeholders on the back of the card. */
  photos: [string, string, string];
};

const ARTISTS: Artist[] = [
  {
    name: "Immanuel Henry",
    role: "WORSHIP LEADER",
    bio: "[Short bio — where he leads worship, songs people know him for, what to expect on the night.]",
    photos: ["linear-gradient(160deg, #FF7A2E, #B8320F 60%, #0B1020)", "#F9A90B", "linear-gradient(160deg, #0A5470, #0B1020)"],
  },
  {
    name: "Unarv Band",
    role: "LIVE BAND",
    bio: "[Short bio — who is in the band, their sound, and how they lead the room in worship.]",
    photos: ["linear-gradient(160deg, #1A8AA8, #0A5470 60%, #0B1020)", "#FDFBF4", "linear-gradient(160deg, #FF4520, #7A1E10)"],
  },
];

const BLURBS = [
  "[One line about Immanuel Henry — e.g. what his worship is known for]",
  "[One line about Unarv Band — e.g. their sound and story]",
];

const EASE = "cubic-bezier(.2,.7,.2,1)";
const AUTOPLAY_MS = 5200;

type State = { i: number; dir: 1 | -1; prep: number; prepSide: "left" | "right"; flipped: boolean };

/** Where one card's art and text sit: centre when current, parked to a side when not. */
function slide(k: number, s: State): { art: CSSProperties; text: CSSProperties; hidden: boolean } {
  const on = `transform .65s ${EASE}, opacity .45s ease, filter .5s ease`;
  const side = (dir: 1 | -1 | "left" | "right"): CSSProperties => {
    const left = dir === -1 || dir === "left";
    return { transform: `translateX(${left ? "-62%" : "62%"}) scale(.94)`, opacity: 0, filter: "blur(10px)", pointerEvents: "none" };
  };
  const hiddenText: CSSProperties = { opacity: 0, transform: "translateY(10px)", pointerEvents: "none" };
  if (k === s.prep) {
    return { art: { transition: "none", ...side(s.prepSide) }, text: { transition: "none", ...hiddenText }, hidden: true };
  }
  if (k === s.i) {
    return {
      art: { transition: on, transform: "translateX(0) scale(1)", opacity: 1, filter: "blur(0px)" },
      text: { transition: `opacity .45s ease .18s, transform .55s ${EASE} .18s`, opacity: 1, transform: "translateY(0)" },
      hidden: false,
    };
  }
  return { art: { transition: on, ...side(s.dir > 0 ? "left" : "right") }, text: { transition: "opacity .25s ease", ...hiddenText }, hidden: true };
}

const FLIP_ICON = (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5" />
  </svg>
);

const flipBtn: CSSProperties = {
  position: "absolute", top: 14, right: 14, height: 40, padding: "0 14px 0 12px", borderRadius: 20,
  border: "1px solid rgba(253, 251, 244, 0.35)", background: "rgba(11, 16, 32, 0.55)", color: "#FDFBF4",
  display: "flex", alignItems: "center", gap: 6, font: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const arrowBtn: CSSProperties = {
  flexShrink: 0, width: 52, height: 52, border: 0, borderRadius: 26, background: "transparent", color: "#F9A90B",
  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0,
};
const face: CSSProperties = {
  position: "absolute", inset: 0, borderRadius: 28, overflow: "hidden", backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
  border: "1.5px solid rgba(253, 251, 244, 0.38)", boxShadow: "0 0 0 6px rgba(249, 169, 11, 0.07), 0 34px 70px rgba(0, 0, 0, 0.5)",
};
const textBox: CSSProperties = {
  position: "absolute", left: 26, right: 26, bottom: 26, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 8,
};
const nameStyle: CSSProperties = { margin: 0, fontWeight: 600, fontSize: "clamp(28px, 3vw, 36px)", lineHeight: 1.05 };
const pill: CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: 1.5, padding: "5px 11px", borderRadius: 8 };
const art: CSSProperties = { position: "absolute", left: 0, top: 0, width: "100%", height: "61%" };
const spin: CSSProperties = { transformBox: "fill-box", transformOrigin: "center" };

function ImmanuelArt() {
  return (
    <svg viewBox="0 0 400 340" style={art}>
      <defs>
        <radialGradient id="ihHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#FF7A2E" stopOpacity="0.9" />
          <stop offset="0.55" stopColor="#FF4520" stopOpacity="0.35" />
          <stop offset="1" stopColor="#FF4520" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ihBeam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE3A8" stopOpacity="0.55" />
          <stop offset="1" stopColor="#FFE3A8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle className="ln-halo" cx="200" cy="190" r="135" fill="url(#ihHalo)" />
      <polygon points="180,0 220,0 280,260 120,260" fill="url(#ihBeam)" opacity="0.6" />
      <g className="ln-bob">
        <path d="M128 340 C130 262 158 222 200 222 C242 222 270 262 272 340 Z" fill="#F9A90B" transform="translate(5,-4)" />
        <circle cx="205" cy="172" r="38" fill="#F9A90B" />
        <path d="M126 340 C128 262 156 220 200 220 C244 220 272 262 274 340 Z" fill="#0B1020" />
        <circle cx="200" cy="176" r="38" fill="#0B1020" />
        <path d="M248 248 L284 150" stroke="#F9A90B" strokeWidth="22" strokeLinecap="round" transform="translate(4,-3)" />
        <path d="M248 248 L284 150" stroke="#0B1020" strokeWidth="22" strokeLinecap="round" />
        <rect x="276" y="118" width="22" height="36" rx="10" fill="#FDFBF4" transform="rotate(20 287 136)" />
      </g>
      <g className="ln-float" style={spin}><circle cx="70" cy="250" r="14" fill="#F9A90B" /></g>
      <g className="ln-float ln-float2" fill="#FF4520" style={spin}>
        <ellipse cx="335" cy="230" rx="13" ry="9" transform="rotate(-20 335 230)" />
        <rect x="342" y="178" width="5" height="52" rx="2" />
        <path d="M346 178 C362 188 366 202 357 214 C361 200 356 194 346 191 Z" />
      </g>
      <g fill="#FDFBF4">
        <path className="ln-spark" d="M60 80 C61 88 62 89 70 90 C62 91 61 92 60 100 C59 92 58 91 50 90 C58 89 59 88 60 80Z" />
        <path className="ln-spark ln-s2" d="M330 70 C331 76 332 77 338 78 C332 79 331 80 330 86 C329 80 328 79 322 78 C328 77 329 76 330 70Z" />
        <path className="ln-spark ln-s3" d="M350 290 C351 298 352 299 360 300 C352 301 351 302 350 310 C349 302 348 301 340 300 C348 299 349 298 350 290Z" />
        <path className="ln-spark ln-s4" d="M95 170 C96 175 97 176 102 177 C97 178 96 179 95 184 C94 179 93 178 88 177 C93 176 94 175 95 170Z" />
      </g>
    </svg>
  );
}

function UnarvArt() {
  return (
    <svg viewBox="0 0 400 340" style={art}>
      <defs>
        <radialGradient id="ubHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#1A8AA8" stopOpacity="0.95" />
          <stop offset="0.55" stopColor="#0A5470" stopOpacity="0.4" />
          <stop offset="1" stopColor="#0A5470" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle className="ln-halo" cx="200" cy="200" r="150" fill="url(#ubHalo)" />
      <g className="ln-bob">
        <circle cx="112" cy="196" r="26" fill="#0B1020" />
        <path d="M64 340 C66 276 86 236 112 236 C138 236 158 276 160 340 Z" fill="#0B1020" />
        <ellipse cx="96" cy="292" rx="26" ry="20" fill="#F9A90B" transform="rotate(-30 96 292)" />
        <path d="M110 282 L170 236" stroke="#F9A90B" strokeWidth="7" strokeLinecap="round" />
        <circle cx="288" cy="196" r="26" fill="#0B1020" />
        <path d="M240 340 C242 276 262 236 288 236 C314 236 334 276 336 340 Z" fill="#0B1020" />
        <rect x="244" y="270" width="92" height="22" rx="6" fill="#FDFBF4" transform="rotate(-12 290 281)" />
        <path d="M256 276 v10 M270 273 v10 M284 270 v10 M298 267 v10 M312 264 v10" stroke="#0B1020" strokeWidth="4" strokeLinecap="round" transform="rotate(-12 290 281)" />
        <circle cx="200" cy="176" r="30" fill="#0B1020" />
        <path d="M148 340 C150 266 172 220 200 220 C228 220 250 266 252 340 Z" fill="#0B1020" />
        <ellipse cx="200" cy="312" rx="46" ry="16" fill="#FF4520" />
        <rect x="154" y="312" width="92" height="28" fill="#FF4520" />
        <ellipse cx="200" cy="312" rx="46" ry="16" fill="#FF7A2E" opacity="0.6" />
      </g>
      <g className="ln-float" fill="#F9A90B" style={spin}>
        <ellipse cx="58" cy="120" rx="12" ry="8" transform="rotate(-20 58 120)" />
        <rect x="64" y="72" width="5" height="48" rx="2" />
        <path d="M68 72 C82 82 86 94 78 104 C82 92 78 86 68 84 Z" />
      </g>
      <g className="ln-float ln-float2" style={spin}><circle cx="345" cy="130" r="12" fill="#FF4520" /></g>
      <g fill="#FDFBF4">
        <path className="ln-spark" d="M330 60 C331 68 332 69 340 70 C332 71 331 72 330 80 C329 72 328 71 320 70 C328 69 329 68 330 60Z" />
        <path className="ln-spark ln-s2" d="M70 40 C71 46 72 47 78 48 C72 49 71 50 70 56 C69 50 68 49 62 48 C68 47 69 46 70 40Z" />
        <path className="ln-spark ln-s3" d="M360 250 C361 258 362 259 370 260 C362 261 361 262 360 270 C359 262 358 261 350 260 C358 259 359 258 360 250Z" />
        <path className="ln-spark ln-s4" d="M40 230 C41 235 42 236 47 237 C42 238 41 239 40 244 C39 239 38 238 33 237 C38 236 39 235 40 230Z" />
      </g>
    </svg>
  );
}

/** The Line-up hero: the heading with a tab per performer, and their swipeable cards (each flips to show pictures). */
export function LineupHero() {
  const [s, setS] = useState<State>({ i: 0, dir: 1, prep: -1, prepSide: "right", flipped: false });
  const iRef = useRef(0);
  const raf = useRef<[number, number]>([0, 0]);
  const hover = useRef(false);
  const touched = useRef(false);
  const down = useRef<{ x: number; y: number } | null>(null);
  const n = ARTISTS.length;
  const cur = ARTISTS[s.i];

  useEffect(() => {
    iRef.current = s.i;
  }, [s.i]);

  // Park the incoming card on the side it enters from, then slide it in on the next frame.
  const go = useCallback(
    (d: number, to?: number) => {
      const from = iRef.current;
      const next = typeof to === "number" ? to : (from + d + n) % n;
      if (next === from) return;
      const dir: 1 | -1 = typeof to === "number" ? (to > from ? 1 : -1) : d > 0 ? 1 : -1;
      setS((p) => ({ ...p, prep: next, prepSide: dir > 0 ? "right" : "left", flipped: false }));
      raf.current[0] = requestAnimationFrame(() => {
        raf.current[1] = requestAnimationFrame(() => setS((p) => ({ ...p, i: next, dir, prep: -1 })));
      });
    },
    [n],
  );

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || s.flipped) return;
    const timer = setInterval(() => {
      if (hover.current || touched.current || document.hidden) return;
      go(1);
    }, AUTOPLAY_MS);
    const frames = raf.current;
    return () => {
      clearInterval(timer);
      frames.forEach(cancelAnimationFrame);
    };
  }, [go, s.flipped]);

  const flip = () => {
    touched.current = true;
    setS((p) => ({ ...p, flipped: !p.flipped }));
  };
  const step = (d: number) => {
    touched.current = true;
    go(d);
  };

  function onUp(e: PointerEvent<HTMLDivElement>) {
    const start = down.current;
    if (!start) return;
    down.current = null;
    if ((e.target as Element).closest("button")) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    touched.current = true;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
    else if (Math.abs(dx) < 8 && Math.abs(dy) < 8) setS((p) => ({ ...p, flipped: !p.flipped }));
  }

  const s0 = slide(0, s);
  const s1 = slide(1, s);

  return (
    <>
    <div style={{ flex: "1 1 380px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
      <span className="p-in p-d1 p-eyebrow">ONE·26 · 26 January 2027</span>
      <h1 className="p-in p-d2 p-h1 o26-ff-fredoka" style={{ fontSize: "clamp(44px, 6.4vw, 84px)" }}>
        Leading the evening <span style={{ color: "#F9A90B" }}>•</span>
      </h1>
      <p className="p-in p-d3 p-lead" style={{ maxWidth: 520 }}>
        A night of worship and live music. Come ready to sing — this isn&apos;t a concert to watch, it&apos;s worship to join.
      </p>
      <span className="p-in p-d3" style={{ fontSize: 15, color: "#C9CCD8" }}>Worship &amp; live music · [TIME]</span>
      <div className="p-in p-d4" role="tablist" aria-label="Choose who to see" style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
        {ARTISTS.map((a, k) => (
          <button
            key={a.name}
            type="button"
            role="tab"
            aria-selected={k === s.i}
            onClick={() => {
              touched.current = true;
              go(0, k);
            }}
            style={{
              height: 46, padding: "0 20px", borderRadius: 23, font: "inherit", fontSize: 15, fontWeight: 600, cursor: "pointer",
              ...(k === s.i
                ? { background: "#F9A90B", color: "#0B1020", border: "1.5px solid #F9A90B" }
                : { background: "transparent", color: "#FDFBF4", border: "1.5px solid rgba(253, 251, 244, 0.4)" }),
            }}
          >
            {a.name}
          </button>
        ))}
      </div>
    </div>
    <div style={{ flex: "1 1 460px", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }} className="p-in p-d4">
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: "clamp(6px, 2vw, 22px)", width: "100%" }}>
        <button type="button" className="ln-arrow ln-prev" aria-label="Previous" onClick={() => step(-1)} style={arrowBtn}>
          <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"><path d="M17 4L6 12l11 8z" /></svg>
        </button>
        <div
          className="ln-stage"
          onPointerDown={(e) => { down.current = { x: e.clientX, y: e.clientY }; }}
          onPointerUp={onUp}
          onPointerEnter={() => { hover.current = true; }}
          onPointerLeave={() => { hover.current = false; }}
          style={{ position: "relative", width: "min(440px, calc(100vw - 150px))", aspectRatio: "5 / 7", perspective: 1400, touchAction: "pan-y", cursor: "grab", userSelect: "none" }}
        >
          <div className="ln-flip" style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transition: `transform 0.8s ${EASE}`, transform: s.flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}>
            <div style={{ ...face, background: "linear-gradient(172deg, #141B33 0%, #10243F 42%, #0A5470 100%)", color: "#FDFBF4", boxShadow: `${face.boxShadow}, inset 0 1px 0 rgba(255, 255, 255, 0.14)` }}>
              <div aria-hidden="true" style={{ position: "absolute", right: -40, top: -40, width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle, rgba(253, 251, 244, 0.16), rgba(253, 251, 244, 0) 70%)" }} />
              <div aria-hidden={s0.hidden} style={{ position: "absolute", inset: 0, ...s0.art }}><ImmanuelArt /></div>
              <div aria-hidden={s1.hidden} style={{ position: "absolute", inset: 0, ...s1.art }}><UnarvArt /></div>
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "42%" }}>
                <div aria-hidden={s0.hidden} style={{ ...textBox, ...s0.text }}>
                  <span style={{ ...pill, background: "#F9A90B", color: "#0B1020" }}>WORSHIP LEADER</span>
                  <h2 className="o26-ff-fredoka" style={nameStyle}>Immanuel Henry</h2>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "#E6E3DA" }}>{BLURBS[0]}</p>
                </div>
                <div aria-hidden={s1.hidden} style={{ ...textBox, ...s1.text }}>
                  <span style={{ ...pill, background: "#FDFBF4", color: "#0B1020" }}>LIVE BAND</span>
                  <h2 className="o26-ff-fredoka" style={nameStyle}>Unarv Band</h2>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "#DCE8EE" }}>{BLURBS[1]}</p>
                </div>
              </div>
              <button type="button" className="ln-flipbtn" aria-label="Flip card to see pictures" onClick={flip} style={{ ...flipBtn, zIndex: 3 }}>
                {FLIP_ICON}Pictures
              </button>
            </div>
            <div
              style={{
                ...face, transform: "rotateY(180deg)", background: "linear-gradient(172deg, #0A5470 0%, #10243F 55%, #141B33 100%)", color: "#FDFBF4",
                padding: 24, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 14,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingRight: 96 }}>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.5, color: "#F9A90B" }}>{cur.role}</span>
                <span className="o26-ff-fredoka" style={{ fontWeight: 600, fontSize: 28, lineHeight: 1.05 }}>{cur.name}</span>
              </div>
              <div style={{ flexGrow: 1, minHeight: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gridTemplateRows: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                <div role="img" aria-label="Photo placeholder" style={{ gridRow: "span 2", borderRadius: 18, background: cur.photos[0], display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "#FDFBF4", fontSize: 12, fontWeight: 600 }}>
                  <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="6" width="18" height="14" rx="3" /><circle cx="12" cy="13" r="3.5" /><path d="M8 6l1.5-2h5L16 6" />
                  </svg>
                  [PHOTO 1]
                </div>
                <div role="img" aria-label="Photo placeholder" style={{ borderRadius: 18, background: cur.photos[1], display: "flex", alignItems: "center", justifyContent: "center", color: "#0B1020", fontSize: 12, fontWeight: 600 }}>[PHOTO 2]</div>
                <div role="img" aria-label="Photo placeholder" style={{ borderRadius: 18, background: cur.photos[2], display: "flex", alignItems: "center", justifyContent: "center", color: "#FDFBF4", fontSize: 12, fontWeight: 600 }}>[PHOTO 3]</div>
              </div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "#E6E3DA" }}>{cur.bio}</p>
              <button type="button" className="ln-flipbtn" aria-label="Flip card back" onClick={flip} style={flipBtn}>
                {FLIP_ICON}Back
              </button>
            </div>
          </div>
        </div>
        <button type="button" className="ln-arrow ln-next" aria-label="Next" onClick={() => step(1)} style={arrowBtn}>
          <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"><path d="M7 4l11 8-11 8z" /></svg>
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {ARTISTS.map((a, k) => (
          <span
            key={a.name}
            aria-hidden="true"
            style={{
              display: "block", height: 8, borderRadius: 4, transition: "width .4s, background .4s",
              ...(k === s.i ? { width: 28, background: "#F9A90B" } : { width: 8, background: "rgba(253, 251, 244, 0.35)" }),
            }}
          />
        ))}
      </div>
      <span aria-live="polite" style={{ fontSize: 13, color: "#C9CCD8", textAlign: "center" }}>
        {s.i + 1} of {n} — {cur.name} · Swipe or use the arrows · Tap the card to see pictures
      </span>
    </div>
    </>
  );
}