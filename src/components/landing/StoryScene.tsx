import { BoyAnimation } from "@/components/landing/BoyAnimation";
import { FlameLogo } from "@/components/landing/FlameLogo";

const TAGLINE = "One for the Nation, One for the Youth";

const NOTES: { fill: string; shape: "note8" | "note16"; x: number; y: number }[] = [
  { fill: "#F9A90B", shape: "note8", x: 560, y: 700 },
  { fill: "#0A5470", shape: "note16", x: 1290, y: 640 },
  { fill: "#FF4520", shape: "note8", x: 1420, y: 760 },
  { fill: "#FF4520", shape: "note16", x: 420, y: 560 },
  { fill: "#F9A90B", shape: "note8", x: 1500, y: 470 },
  { fill: "#0A5470", shape: "note8", x: 660, y: 430 },
  { fill: "#F9A90B", shape: "note16", x: 1180, y: 360 },
  { fill: "#FF4520", shape: "note8", x: 470, y: 820 },
];

/** The night sky behind the opening; twinkles until the cream day spreads over it. */
const STARS: [number, number, number][] = [[726, -392, 3], [2066, -602, 1.6], [1594, -508, 2.4], [1787, -582, 2], [-447, -524, 3], [1112, -557, 2], [-229, 428, 3], [-358, 458, 1.6], [314, 591, 1.6], [1763, 499, 3], [-397, -248, 1.6], [1680, -428, 2.4], [1116, -405, 1.6], [1738, -69, 2], [-178, 491, 2], [925, -501, 1.6], [1711, -578, 2], [1433, 693, 3], [686, 253, 3], [881, -87, 2], [136, -201, 1.6], [1752, -86, 3], [806, 219, 2.4], [1894, -551, 1.6], [1496, 156, 2], [2501, 0, 2], [1402, 163, 1.6], [2137, -542, 2.4], [793, 17, 3], [1775, 234, 1.6], [-217, -148, 3], [2255, 660, 1.6], [-352, -66, 3], [565, 90, 2.4], [-508, 245, 2.4], [88, 551, 1.6], [1422, -580, 2], [577, -436, 2], [1029, 100, 3], [-270, -360, 3], [1045, 425, 2.4], [-40, 181, 2.4], [2293, 150, 2.4], [2196, 79, 2], [18, -531, 2], [19, -225, 2]];

/**
 * The 1920×1080 world the scroll story plays in. Element ids are the targets of the GSAP
 * timeline in StoryIntro, so keep them in step with it.
 */
export function StoryScene() {
  return (
    <div id="o26-world" aria-hidden="true">
      <svg viewBox="0 0 1920 1080" width="1920" height="1080">
        <g id="shake">
          <rect x="-3000" y="-3000" width="7920" height="7080" fill="none" />
          <g fill="#FDFBF4">
            {STARS.map(([cx, cy, r], i) => (
              <circle key={i} className="o26-star" cx={cx} cy={cy} r={r} />
            ))}
          </g>
        </g>
      </svg>

      {/* The snapping boy: StoryIntro sizes this canvas to the visible scene and scrubs it with the scroll. */}
      <BoyAnimation />

      <div id="fire" className="o26-layer">
        <div id="firevid">
          <video id="v-fire" muted playsInline loop preload="auto" src="/landing/fire.webm" />
          {/* Safari and iOS can't show transparent WebM, so they get the animated WebP instead. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- animated WebP, swapped in at runtime */}
          <img id="i-fire" alt="" src="/landing/fire.webp" />
        </div>
        {/* The warm glow behind the burning logo: a gradient whose opacity is tweened (cheap), not a blurred filter. */}
        <div id="logoglow" />
        <div id="logo">
          {/* StoryIntro scrubs the burn-in front through flameReveal as you scroll. Drawn at 0.65 size to keep frames cheap. */}
          <div className="o26-logo-art">
            <FlameLogo ignite={false} glow={false} externalReveal scale={0.65} />
          </div>
        </div>
      </div>

      <svg viewBox="0 0 1920 1080" width="1920" height="1080">
        <defs>
          <g id="note8">
            <ellipse cx="0" cy="0" rx="24" ry="17" transform="rotate(-20)" />
            <rect x="15" y="-104" width="8" height="102" rx="3" />
            <path d="M21 -104 C52 -84 60 -56 42 -34 C50 -60 40 -72 21 -78 Z" />
          </g>
          <g id="note16">
            <ellipse cx="0" cy="0" rx="24" ry="17" transform="rotate(-20)" />
            <ellipse cx="74" cy="-14" rx="24" ry="17" transform="rotate(-20 74 -14)" />
            <rect x="15" y="-104" width="8" height="102" rx="3" />
            <rect x="89" y="-118" width="8" height="102" rx="3" />
            <path d="M15 -106 L97 -120 L97 -102 L15 -88 Z" />
          </g>
        </defs>
        <g id="o26-title">
          <g id="presenters" opacity="0">
            <image href="/landing/logo-presenter.png" x="902" y="14" width="116" height="141" preserveAspectRatio="xMidYMid meet" />
            <text x="960" y="200" textAnchor="middle" className="o26-ff-poppins" fontWeight="500" fontSize="34" fill="#FDFBF4" letterSpacing="2">
              Christos Marthoma Yuvajana Sakyam
            </text>
            <text x="960" y="244" textAnchor="middle" className="o26-ff-poppins" fontWeight="500" fontSize="34" fill="#FDFBF4" letterSpacing="2">
              <tspan fill="#F9A90B" className="o26-ff-fredoka" fontWeight="600">&amp;</tspan> Young Family Fellowship
            </text>
            <text x="960" y="288" textAnchor="middle" className="o26-ff-poppins" fontWeight="400" fontSize="20" fill="#F9A90B" letterSpacing="10">
              PRESENTS
            </text>
          </g>
          <text id="title-main" x="960" y="520" textAnchor="middle" className="o26-ff-fredoka" fontWeight="600" fontSize="230" fill="#F9A90B" letterSpacing="6" opacity="0">
            ONE·26
          </text>
          <text id="title-tag" x="960" y="620" textAnchor="middle" className="o26-ff-poppins" fontWeight="400" fontSize="42" fill="#FDFBF4" letterSpacing="3" style={{ whiteSpace: "pre" }}>
            {Array.from(TAGLINE).map((ch, i) => (
              <tspan key={i} className="tag-ch" opacity="0">{ch}</tspan>
            ))}
          </text>
          <g id="scrollcue" opacity="0">
            <text x="960" y="930" textAnchor="middle" className="o26-ff-poppins" fontWeight="500" fontSize="22" fill="#FDFBF4" letterSpacing="6" opacity="0.7">
              SCROLL
            </text>
            <path d="M940 955 L960 975 L980 955" stroke="#F9A90B" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </g>
        </g>
        <g id="notes">
          {NOTES.map((n, i) => (
            <g key={i} className="note" fill={n.fill} opacity="0">
              <use href={`#${n.shape}`} x={n.x} y={n.y} />
            </g>
          ))}
        </g>
        <g id="endtext" opacity="0">
          <text id="o26-endtext-k" x="960" y="470" textAnchor="middle" className="o26-ff-poppins" fontWeight="600" fontSize="24" fill="#FF4520" letterSpacing="10">
            REKINDLE · 26 JANUARY 2027
          </text>
          <text id="o26-endtext-t" x="960" y="560" textAnchor="middle" className="o26-ff-fredoka" fontWeight="600" fontSize="64" fill="#0B1020" letterSpacing="1">
            One for the Nation,
          </text>
          <text id="o26-endtext-u" x="960" y="640" textAnchor="middle" className="o26-ff-fredoka" fontWeight="600" fontSize="64" fill="#0A5470" letterSpacing="1">
            One for the Youth
          </text>
        </g>
      </svg>
    </div>
  );
}
