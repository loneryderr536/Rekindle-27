"use client";

import gsap from "gsap";
import { useEffect, useRef } from "react";
import { flameReveal } from "@/components/landing/FlameLogo";
import { StoryScene } from "@/components/landing/StoryScene";

/** px of scrolling that plays the story. */
const LEN = 6500;
/**
 * How much scroll each part of the story gets: [from, to, weight] in story seconds.
 * The boy, the push-in, the snap and the burning logo get extra room so they are never skipped past:
 * the story never waits for anything, scrolling alone plays it.
 */
const SEG: [number, number, number][] = [[2.7, 4.15, 1.4], [4.15, 6.9, 1.3], [6.9, 7.7, 3.2], [7.7, 10.0, 1.3], [10.0, 11.6, 2.2], [11.6, 14.6, 1.0]];
const SEGTOT = SEG.reduce((sum, [a, b, w]) => sum + (b - a) * w, 0);
/** Story time reached at the end of the scroll. */
const END = 14.6;
const IGNITE = 7.55;

type Geo = { s: number; y0: number; ext: number; mobile: boolean };

/** Scroll progress (0–1) → story time, using the weights in SEG. */
export function storyAt(q: number): number {
  let need = q * SEGTOT;
  for (const [a, b, w] of SEG) {
    const len = (b - a) * w;
    if (need <= len) return a + need / w;
    need -= len;
  }
  return END;
}

/** Story time → scroll progress (0–1): the inverse of storyAt. */
export function scrollQ(t: number): number {
  let used = 0;
  for (const [a, b, w] of SEG) {
    if (t <= b) return (used + (Math.max(t, a) - a) * w) / SEGTOT;
    used += (b - a) * w;
  }
  return 1;
}

/** Height of the logo's burn-in front (0 = not lit, 1 = fully alight), eased like the flame canvas. */
function revealAt(t: number): number {
  const x = Math.min(1, Math.max(0, (t - IGNITE) / 1.25));
  return x * x * (3 - 2 * x);
}

function buildTimeline({ s, y0, ext: E, mobile }: Geo): gsap.core.Timeline {
  const g = gsap;
  // Where the burning logo lands: the header's logo slot, top centre.
  const headH = 76, logoPx = 60;
  const logoWorldH = 587.96 * (1177 / 1237); // logo art inside the canvas box
  const k = logoPx / s / logoWorldH;
  const landY = y0 + (headH - logoPx) / 2 / s - 240; // 240 = logo art top in the scene

  g.set("#shake", { x: 0, y: 0 });
  g.set("#camera", { svgOrigin: "0 0", scale: 1, x: 0, y: 0 });
  g.set("#boy", { y: 1080 + E, opacity: 1, visibility: "visible" });
  g.set("#o26-title", { y: 0 });
  g.set("#presenters", { opacity: 0, y: 16 });
  g.set("#title-main", { opacity: 0, scale: 0.9, transformOrigin: "50% 50%" });
  g.set(".tag-ch", { opacity: 0 });
  g.set("#scrollcue", { opacity: 0, y: 0 });
  g.set("#fingers-pressed", { opacity: 1 });
  g.set("#fingers-snapped", { opacity: 0 });
  g.set("#sparks", { opacity: 0 });
  g.set("#snapfx", { opacity: 0 });
  g.set("#snapring", { scale: 0.4, opacity: 1, transformOrigin: "50% 50%" });
  g.set("#snaplines", { scale: 0.4, opacity: 1, svgOrigin: "960 760" });
  g.set("#flash", { opacity: 0 });
  g.set("#o26-day-disc", { scale: 0, transformOrigin: "50% 50%" });
  g.set("#o26-tex-cream", { opacity: 0 });
  g.set("#logoglow", { opacity: 0 });
  g.set("#firevid", { opacity: 0, scale: 0.12, transformOrigin: "550px 858px" });
  g.set("#logo", { opacity: 0, scale: 0.88, transformOrigin: "50% 85%" });
  g.set("#fire", { x: 0, y: 0, scale: 1, transformOrigin: "960px 240px" });
  g.set("#endtext", { opacity: 0, y: 40 });
  g.set(".note", { opacity: 0, y: 40, rotation: -8, transformOrigin: "50% 50%" });
  g.set("#o26-header", { autoAlpha: 0 });
  g.set(".o26-hl", { x: mobile ? 0 : 40, opacity: 0 });
  g.set(".o26-hr", { x: mobile ? 0 : -40, opacity: 0 });
  g.set("#o26-hlogo", { opacity: 0 });
  g.set("#o26-scrub", { autoAlpha: 1 });

  const tl = g.timeline({ paused: true, defaults: { ease: "power2.out" } });
  // 1. Presenters, then the title
  tl.to("#presenters", { opacity: 1, y: 0, duration: 0.7 }, 0.15)
    .to("#title-main", { opacity: 1, scale: 1, duration: 1.1, ease: "back.out(1.6)" }, 0.6)
    .to(".tag-ch", { opacity: 1, duration: 0.25, stagger: 0.025 }, 1.2)
    .to("#scrollcue", { opacity: 1, duration: 0.4 }, 2.3)
    .to("#scrollcue", { y: 10, duration: 0.35, yoyo: true, repeat: 1, ease: "sine.inOut" }, 2.4);
  // 2. Title lifts away, the boy rises into frame
  tl.to("#o26-title", { y: -700 - E, duration: 1.45, ease: "sine.inOut" }, 2.7)
    .to("#scrollcue", { opacity: 0, duration: 0.3 }, 2.7)
    .to("#boy", { y: 60, duration: 1.45, ease: "sine.inOut" }, 2.7);
  // 3. Push in onto the fingers
  tl.to("#camera", { scale: 2.4, x: -2184, y: 100, duration: 2.5, ease: "power2.inOut" }, 3.9)
    .to("#sparks", { opacity: 1, duration: 0.08, repeat: 9, yoyo: true, ease: "none" }, 6.1)
    .set("#sparks", { opacity: 1 }, 6.9);
  // 4. SNAP
  tl.set("#fingers-pressed", { opacity: 0 }, 7.0)
    .set("#fingers-snapped", { opacity: 1 }, 7.0)
    .set("#sparks", { opacity: 0 }, 7.0)
    .set("#snapfx", { opacity: 1 }, 7.0)
    .to("#snapring", { scale: 3.4, opacity: 0, duration: 0.4, ease: "power3.out" }, 7.0)
    .to("#snaplines", { scale: 1.25, opacity: 0, duration: 0.35, ease: "power3.out" }, 7.0)
    .to("#flash", { opacity: 0.18, duration: 0.05, ease: "none" }, 7.0)
    .to("#flash", { opacity: 0, duration: 0.25 }, 7.05)
    .to("#o26-day-disc", { scale: 1, duration: 1.9, ease: "power2.inOut" }, 7.35)
    .to("#o26-tex-cream", { opacity: 1, duration: 1.0, ease: "power1.inOut" }, 8.3)
    .to("#shake", { x: 6, y: -4, duration: 0.04, ease: "none" }, 7.02)
    .to("#shake", { x: -6, y: 3, duration: 0.05, ease: "none" }, 7.06)
    .to("#shake", { x: 3, y: -2, duration: 0.05, ease: "none" }, 7.11)
    .to("#shake", { x: 0, y: 0, duration: 0.06, ease: "none" }, 7.16);
  // 5. Ignition: the fire footage bursts from the fingertips and the logo grows out of it
  tl.to("#firevid", { opacity: 1, duration: 0.12, ease: "none" }, 7.45)
    .to("#firevid", { scale: 1, duration: 0.7, ease: "power3.out" }, 7.45)
    .set("#logo", { opacity: 1 }, IGNITE)
    .to("#logo", { scale: 1, duration: 1.3, ease: "power2.out" }, IGNITE)
    .to("#logoglow", { opacity: 0.95, duration: 0.9, ease: "power1.out" }, 7.55)
    .to("#logoglow", { opacity: 0.6, duration: 0.18, ease: "sine.inOut", yoyo: true, repeat: 5 }, 8.8)
    .to("#logo", { scale: 1.015, duration: 0.3, ease: "sine.inOut", yoyo: true, repeat: 3 }, 8.85)
    .to("#firevid", { opacity: 0, duration: 0.7, ease: "power1.inOut" }, 8.6);
  // 6. The boy steps out of frame; the flaming logo is left alone on the cream
  tl.to("#logoglow", { opacity: 0, duration: 0.9, ease: "power1.out" }, 10.2)
    .to("#boy", { opacity: 0, y: 220, duration: 1.1, ease: "power2.in" }, 9.9)
    .set("#boy", { visibility: "hidden" }, 11.0)
    .to("#o26-scrub", { autoAlpha: 0, duration: 0.4 }, 11.6);
  // 7. The logo rises into the header, the menu opens out on both sides
  tl.to("#fire", { y: landY, scale: k, duration: 1.2, ease: "power3.inOut" }, 11.6)
    .to("#endtext", { opacity: 1, y: 0, duration: 0.9 }, 12.3)
    .to("#o26-header", { autoAlpha: 1, duration: 0.45 }, 12.55)
    .to("#o26-hlogo", { opacity: 1, duration: 0.2, ease: "none" }, 12.8)
    .to("#logo", { opacity: 0, duration: 0.2, ease: "none" }, 12.85)
    .to(".o26-hl", { x: 0, opacity: 1, duration: 0.6 }, 12.85)
    .to(".o26-hr", { x: 0, opacity: 1, duration: 0.6 }, 12.85);
  g.utils.toArray<Element>(".note").forEach((n, i) => {
    const t0 = 12.0 + i * 0.16;
    tl.to(n, { opacity: 1, y: -170, rotation: 8, duration: 1.4, ease: "power1.out" }, t0)
      .to(n, { y: -260, opacity: 0.75, rotation: -4, duration: 15 - t0 - 1.4, ease: "sine.inOut" }, t0 + 1.4);
  });
  tl.set({}, {}, 15);
  return tl;
}

/** The Rekindle story: an opening that plays by itself, then a 1920×1080 scene scrubbed by scrolling. */
export function StoryIntro() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const root = section?.closest<HTMLElement>("#o26-root");
    if (!section || !root) return;
    const $ = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;
    const stage = $<HTMLDivElement>("#o26-stage");
    const world = $<HTMLDivElement>("#o26-world");
    const vid = $<HTMLVideoElement>("#v-fire");
    const img = $<HTMLImageElement>("#i-fire");
    const fill = $<HTMLDivElement>("#o26-scrub-fill");
    const texNavy = $<HTMLDivElement>("#o26-tex-navy");
    const texCream = $<HTMLDivElement>("#o26-tex-cream");
    const endK = $<SVGTextElement>("#o26-endtext-k");
    const endT = $<SVGTextElement>("#o26-endtext-t");
    const endU = $<SVGTextElement>("#o26-endtext-u");

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Safari / iOS can't show transparent WebM, so they get the animated WebP flame instead.
    const ua = navigator.userAgent;
    const webmOk = vid.canPlayType('video/webm; codecs="vp9"');
    const useImg = /iPhone|iPad|iPod/.test(ua) || (/Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox|OPR/.test(ua)) || !webmOk;
    if (useImg) {
      vid.style.display = "none";
      img.style.display = "block";
    } else {
      vid.muted = true;
    }

    const ctx = gsap.context(() => {}, root);
    let tl: gsap.core.Timeline | null = null;
    let layoutKey = "";
    let cur = 0;
    let last = 0;
    let fireOn = false;
    let lastBgY = NaN;
    let raf = 0;
    const introStart = performance.now();

    // Fit the 1920×1080 scene to any screen: wide screens see the full frame,
    // phones see a taller, narrower window centred on the story.
    const layout = (force: boolean) => {
      const w = stage.clientWidth, h = stage.clientHeight;
      if (!w || !h) return;
      const a = w / h;
      const W = Math.max(1100, 1080 * a);
      const H = W / a;
      const x0 = 960 - W / 2, y0 = 540 - H / 2;
      const s = w / W;
      world.style.transform = `scale(${s}) translate(${-x0}px, ${-y0}px)`;
      const narrow = W < 1300;
      endK.setAttribute("font-size", narrow ? "30" : "24");
      endK.setAttribute("letter-spacing", narrow ? "6" : "10");
      endT.setAttribute("font-size", narrow ? "84" : "64");
      endU.setAttribute("font-size", narrow ? "84" : "64");
      const key = `${w}x${h}`;
      if (force || key !== layoutKey) {
        layoutKey = key;
        const keep = tl ? tl.time() : 0;
        tl?.kill();
        ctx.add(() => {
          tl = buildTimeline({ s, y0, ext: Math.max(0, (H - 1080) / 2), mobile: w <= 640 });
        });
        tl!.time(0);
        tl!.time(keep);
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      // Re-fit as soon as the stage changes size (window resize, mobile toolbar, scrollbar appearing).
      if (`${stage.clientWidth}x${stage.clientHeight}` !== layoutKey) layout(false);
      const into = window.scrollY - section.offsetTop;
      const p = Math.min(1, Math.max(0, into / LEN));
      // The paper pattern travels with the scroll, exactly like the page beneath the pinned stage.
      // Moving whole tiles keeps the pattern seamless, so the layers only ever shift by less than one tile.
      const tile = window.innerWidth <= 760 ? 540 : 760;
      const bgY = -(Math.round(Math.min(LEN, Math.max(0, into))) % tile);
      if (bgY !== lastBgY) {
        lastBgY = bgY;
        const tf = `translate3d(0, ${bgY}px, 0)`;
        texNavy.style.transform = tf;
        texCream.style.transform = tf;
      }
      // The opening (presenters + title) plays on its own; scrolling then moves the playhead.
      const intro = Math.min(2.65, (now - introStart) / 1000);
      const scrollT = p > 0.0005 ? storyAt(Math.min(1, p / 0.94)) : 0;
      const target = Math.max(intro, scrollT);
      const dt = Math.min(0.1, (now - (last || now)) / 1000);
      last = now;
      if (reduce || into > LEN + stage.clientHeight) cur = target;
      else {
        // Ease towards the scroll position, but never faster than ~1.6× real time,
        // so even a fast flick plays the boy, the snap and the fire like a video.
        const step = (target - cur) * (1 - Math.exp(-dt * 6));
        const cap = dt * (target < cur ? 5 : 1.6); // rewinding can be quicker
        cur += Math.max(-cap, Math.min(cap, step));
        if (Math.abs(target - cur) < 0.002) cur = target;
      }
      const t = cur;
      if (tl && Math.abs(tl.time() - t) > 0.0004) tl.time(t);
      fill.style.width = `${(Math.min(1, t / END) * 100).toFixed(2)}%`;
      if (into > LEN + stage.clientHeight) return; // story is off screen

      // The real fire footage plays while it is on screen.
      const nowOn = t >= 7.4 && t < 9.4;
      if (nowOn && !fireOn) {
        if (useImg) {
          const src = img.getAttribute("src") ?? "";
          img.setAttribute("src", "");
          img.setAttribute("src", src);
        } else {
          try {
            vid.currentTime = Math.max(0, (t - 7.45) % 4);
          } catch {
            // Not seekable yet; it plays from the start instead.
          }
          vid.play().catch(() => {});
        }
      } else if (!nowOn && fireOn && !useImg) {
        vid.pause();
      }
      fireOn = nowOn;

      // The logo burns in from the bottom, following the playhead (the flame canvas draws the front itself).
      flameReveal.value = revealAt(t);
    };

    layout(true);
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      vid.pause();
      ctx.revert();
    };
  }, []);

  return (
    <section id="o26-story" ref={sectionRef} aria-label="ONE·26 Rekindle — the story">
      <div id="o26-stage">
        <div id="o26-tex-navy" className="o26-tex o26-tex-navy" aria-hidden="true" />
        <div id="o26-day" aria-hidden="true">
          <div id="o26-day-disc" />
          <div id="o26-tex-cream" className="o26-tex o26-tex-cream" />
        </div>
        <StoryScene />
        <div id="o26-scrub" aria-hidden="true">
          <div id="o26-scrub-fill" />
        </div>
      </div>
    </section>
  );
}
