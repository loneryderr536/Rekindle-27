import { FlameLogo } from "@/components/landing/FlameLogo";

const TAGLINE = "One for the Nation, One for the Youth";

const NOTES: { fill: string; shape: "note8" | "note16"; x: number; y: number }[] = [
  { fill: "#F9A90B", shape: "note8", x: 560, y: 700 },
  { fill: "#1A8AA8", shape: "note16", x: 1290, y: 640 },
  { fill: "#FF4520", shape: "note8", x: 1420, y: 760 },
  { fill: "#FF4520", shape: "note16", x: 420, y: 560 },
  { fill: "#F9A90B", shape: "note8", x: 1500, y: 470 },
  { fill: "#1A8AA8", shape: "note8", x: 660, y: 430 },
  { fill: "#F9A90B", shape: "note16", x: 1180, y: 360 },
  { fill: "#FF4520", shape: "note8", x: 470, y: 820 },
];

const SNAP_LINES = [
  [960, 640, 960, 560],
  [1045, 675, 1102, 618],
  [1080, 760, 1160, 760],
  [875, 675, 818, 618],
  [840, 760, 760, 760],
  [1045, 845, 1102, 902],
  [875, 845, 818, 902],
];

/**
 * The 1920×1080 world the scroll story plays in. Element ids are the targets of the GSAP
 * timeline in StoryIntro, so keep them in step with it.
 */
export function StoryScene() {
  return (
    <div id="o26-world" aria-hidden="true">
      <svg viewBox="0 0 1920 1080" width="1920" height="1080">
        <g id="shake">
          <rect x="-3000" y="-3000" width="7920" height="7080" fill="#0B1020" />
          <g id="camera">
            <g id="boy">
              <path d="M570 1100 C570 860 610 700 710 660 Q830 620 950 660 C1050 700 1090 860 1090 1100 Z" fill="#F9A90B" transform="translate(10,-8)" />
              <path d="M1000 790 L1222 420" stroke="#F9A90B" strokeWidth="132" strokeLinecap="round" transform="translate(9,-7)" />
              <ellipse cx="831" cy="473" rx="105" ry="125" fill="#F9A90B" />
              <path d="M560 1100 C560 860 600 700 700 660 Q820 620 940 660 C1040 700 1080 860 1080 1100 Z" fill="#0A5470" />
              <path d="M690 965 Q820 935 950 965 L972 1100 L668 1100 Z" fill="#08465D" />
              <path d="M700 668 Q820 742 940 668 Q935 606 820 598 Q705 606 700 668 Z" fill="#083F54" />
              <line x1="795" y1="690" x2="785" y2="822" stroke="#F9A90B" strokeWidth="9" strokeLinecap="round" />
              <line x1="850" y1="690" x2="861" y2="822" stroke="#F9A90B" strokeWidth="9" strokeLinecap="round" />
              <circle cx="785" cy="828" r="9" fill="#F9A90B" />
              <circle cx="861" cy="828" r="9" fill="#F9A90B" />
              <path d="M1000 790 L1222 420" stroke="#0A5470" strokeWidth="132" strokeLinecap="round" />
              <path d="M1198 458 L1238 392" stroke="#083F54" strokeWidth="122" strokeLinecap="round" />
              <path d="M1236 396 L1262 356" stroke="#8F5A35" strokeWidth="70" strokeLinecap="round" />
              <rect x="786" y="560" width="68" height="96" rx="20" fill="#8F5A35" />
              <ellipse cx="722" cy="495" rx="21" ry="33" fill="#B7774A" />
              <ellipse cx="724" cy="497" rx="9" ry="17" fill="#8F5A35" />
              <ellipse cx="820" cy="480" rx="105" ry="125" fill="#B7774A" />
              <path d="M706 488 C688 372 758 334 836 336 C908 338 952 384 934 458 C916 426 882 404 840 408 C806 412 780 430 768 470 C752 454 736 466 730 502 Z" fill="#1A1420" />
              <path d="M800 340 C820 300 870 296 900 318 C872 314 848 322 836 338 Z" fill="#1A1420" />
              <path d="M838 426 L873 418" stroke="#1A1420" strokeWidth="9" strokeLinecap="round" />
              <path d="M897 414 L928 416" stroke="#1A1420" strokeWidth="9" strokeLinecap="round" />
              <ellipse cx="858" cy="456" rx="10" ry="13" fill="#1A1420" />
              <ellipse cx="911" cy="451" rx="9" ry="12" fill="#1A1420" />
              <circle cx="861" cy="451" r="3" fill="#FDFBF4" />
              <circle cx="914" cy="446" r="3" fill="#FDFBF4" />
              <path d="M908 470 Q930 504 902 512 Z" fill="#8F5A35" />
              <ellipse cx="872" cy="520" rx="20" ry="11" fill="#FF4520" opacity="0.28" />
              <path d="M858 545 Q888 568 914 538" stroke="#1A1420" strokeWidth="7" strokeLinecap="round" fill="none" />
              <g id="hand">
                <path d="M1296 282 Q1322 230 1338 188" stroke="#8F5A35" strokeWidth="32" strokeLinecap="round" fill="none" />
                <ellipse cx="1272" cy="335" rx="62" ry="74" fill="#B7774A" transform="rotate(-25 1272 335)" />
                <circle cx="1326" cy="324" r="24" fill="#8F5A35" />
                <circle cx="1318" cy="362" r="21" fill="#8F5A35" />
                <g id="fingers-pressed">
                  <path d="M1314 292 Q1344 255 1310 228" stroke="#B7774A" strokeWidth="34" strokeLinecap="round" fill="none" />
                  <path d="M1232 318 Q1250 262 1302 226" stroke="#B7774A" strokeWidth="36" strokeLinecap="round" fill="none" />
                </g>
                <g id="fingers-snapped" opacity="0">
                  <path d="M1232 318 Q1262 250 1320 204" stroke="#B7774A" strokeWidth="36" strokeLinecap="round" fill="none" />
                  <path d="M1316 292 Q1310 340 1272 356" stroke="#8F5A35" strokeWidth="34" strokeLinecap="round" fill="none" />
                </g>
                <g id="sparks" fill="#F9A90B" opacity="0">
                  <circle cx="1338" cy="196" r="5" />
                  <circle cx="1292" cy="200" r="4" />
                  <circle cx="1322" cy="176" r="3.5" />
                  <circle cx="1350" cy="222" r="3" />
                  <circle cx="1300" cy="182" r="2.5" fill="#FF4520" />
                </g>
              </g>
            </g>
          </g>
          <g id="snapfx" opacity="0">
            <circle id="snapring" cx="960" cy="760" r="40" fill="none" stroke="#FDFBF4" strokeWidth="14" />
            <g id="snaplines" stroke="#FDFBF4" strokeWidth="12" strokeLinecap="round">
              {SNAP_LINES.map(([x1, y1, x2, y2]) => (
                <line key={`${x1}-${y1}`} x1={x1} y1={y1} x2={x2} y2={y2} />
              ))}
            </g>
          </g>
          <rect id="flash" x="-3000" y="-3000" width="7920" height="7080" fill="#FDFBF4" opacity="0" />
        </g>
        <circle id="lightwipe" cx="960" cy="560" r="0" fill="#141B33" />
      </svg>

      <div id="fire" className="o26-layer">
        <div id="firevid">
          <video id="v-fire" muted playsInline loop preload="auto" src="/landing/fire.webm" />
          {/* Safari and iOS can't show transparent WebM, so they get the animated WebP instead. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- animated WebP, swapped in at runtime */}
          <img id="i-fire" alt="" src="/landing/fire.webp" />
        </div>
        <div id="logo">
          {/* The burn-in mask from StoryIntro is applied to this wrapper every frame, so the canvas skips its own ignite. */}
          <div className="o26-logo-art">
            <FlameLogo ignite={false} glow={false} />
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
          <linearGradient id="fadeTop" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0B1020" />
            <stop offset="1" stopColor="#0B1020" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="fadeBottom" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0B1020" stopOpacity="0" />
            <stop offset="1" stopColor="#0B1020" />
          </linearGradient>
        </defs>
        <g id="o26-title">
          <g id="presenters" opacity="0">
            <text x="960" y="168" textAnchor="middle" className="o26-ff-poppins" fontWeight="500" fontSize="34" fill="#FDFBF4" letterSpacing="2">
              Christos Marthoma Yuvajana Sakyam
            </text>
            <text x="960" y="218" textAnchor="middle" className="o26-ff-poppins" fontWeight="500" fontSize="34" fill="#FDFBF4" letterSpacing="2">
              <tspan fill="#F9A90B" className="o26-ff-fredoka" fontWeight="600">&amp;</tspan> Young Family Fellowship
            </text>
            <text x="960" y="272" textAnchor="middle" className="o26-ff-poppins" fontWeight="400" fontSize="20" fill="#F9A90B" letterSpacing="10">
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
        <g id="edgefade" pointerEvents="none">
          <rect id="o26-edge-top" x="0" y="0" width="1920" height="170" fill="url(#fadeTop)" />
          <rect id="o26-edge-bot" x="0" y="880" width="1920" height="200" fill="url(#fadeBottom)" />
        </g>
        <g id="notes">
          {NOTES.map((n, i) => (
            <g key={i} className="note" fill={n.fill} opacity="0">
              <use href={`#${n.shape}`} x={n.x} y={n.y} />
            </g>
          ))}
        </g>
        <g id="holdhint" opacity="0" style={{ transition: "opacity 0.4s" }}>
          <text x="960" y="140" textAnchor="middle" className="o26-ff-poppins" fontWeight="500" fontSize="22" fill="#FDFBF4" letterSpacing="6" opacity="0.8">
            KEEP SCROLLING
          </text>
          <path d="M940 162 L960 182 L980 162" stroke="#F9A90B" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </g>
        <g id="endtext" opacity="0">
          <text id="o26-endtext-k" x="960" y="470" textAnchor="middle" className="o26-ff-poppins" fontWeight="600" fontSize="24" fill="#FF4520" letterSpacing="10">
            REKINDLE · 26 JANUARY 2027
          </text>
          <text id="o26-endtext-t" x="960" y="560" textAnchor="middle" className="o26-ff-fredoka" fontWeight="600" fontSize="64" fill="#FDFBF4" letterSpacing="1">
            One for the Nation,
          </text>
          <text id="o26-endtext-u" x="960" y="640" textAnchor="middle" className="o26-ff-fredoka" fontWeight="600" fontSize="64" fill="#1A8AA8" letterSpacing="1">
            One for the Youth
          </text>
        </g>
      </svg>
    </div>
  );
}
