import type { Metadata } from "next";
import Link from "next/link";
import { BrandPage } from "@/components/landing/BrandPage";
import { LINKS } from "@/components/landing/links";
import { LineupHero } from "@/components/lineup/LineupHero";

export const metadata: Metadata = {
  title: "Line-up",
  description: "Immanuel Henry and Unarv Band lead the evening of worship and live music at ONE·26 Rekindle, 26 January 2027.",
};

const STARS: [number, number, number][] = [[120, 90, 2], [380, 160, 1.5], [640, 60, 2], [980, 120, 1.5], [1300, 80, 2], [1180, 420, 1.5], [260, 560, 2], [820, 780, 1.5], [1380, 700, 2], [60, 820, 1.5]];
const NOTES = [
  { fill: "#F9A90B", opacity: 0.5, shape: "lnote8", x: 110, y: 330 },
  { fill: "#FF4520", opacity: 0.5, shape: "lnote16", x: 1240, y: 250 },
  { fill: "#0A5470", opacity: 0.7, shape: "lnote8", x: 1320, y: 760 },
  { fill: "#F9A90B", opacity: 0.4, shape: "lnote16", x: 220, y: 800 },
];

export default function LineupPage() {
  return (
    <BrandPage current="lineup">
      <section className="o26-navy" style={{ position: "relative", overflow: "hidden", color: "#FDFBF4", borderRadius: "0 0 48px 48px" }}>
        <svg aria-hidden="true" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          <defs>
            <radialGradient id="lnSky" cx="20%" cy="10%" r="70%">
              <stop offset="0" stopColor="#1B2650" />
              <stop offset="1" stopColor="#0B1020" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="lnSky2" cx="85%" cy="95%" r="60%">
              <stop offset="0" stopColor="#0A5470" stopOpacity="0.55" />
              <stop offset="1" stopColor="#0B1020" stopOpacity="0" />
            </radialGradient>
            <g id="lnote8">
              <ellipse cx="0" cy="0" rx="24" ry="17" transform="rotate(-20)" />
              <rect x="15" y="-104" width="8" height="102" rx="3" />
              <path d="M21 -104 C52 -84 60 -56 42 -34 C50 -60 40 -72 21 -78 Z" />
            </g>
            <g id="lnote16">
              <ellipse cx="0" cy="0" rx="24" ry="17" transform="rotate(-20)" />
              <ellipse cx="74" cy="-14" rx="24" ry="17" transform="rotate(-20 74 -14)" />
              <rect x="15" y="-104" width="8" height="102" rx="3" />
              <rect x="89" y="-118" width="8" height="102" rx="3" />
              <path d="M15 -106 L97 -120 L97 -102 L15 -88 Z" />
            </g>
          </defs>
          <rect width="1440" height="900" fill="url(#lnSky)" />
          <rect width="1440" height="900" fill="url(#lnSky2)" />
          <g fill="#FDFBF4">
            {STARS.map(([cx, cy, r]) => (
              <circle key={`${cx}-${cy}`} className="ln-star" cx={cx} cy={cy} r={r} />
            ))}
          </g>
          {NOTES.map((n) => (
            <g key={`${n.x}-${n.y}`} className="p-note" fill={n.fill} opacity={n.opacity} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
              <use href={`#${n.shape}`} x={n.x} y={n.y} />
            </g>
          ))}
        </svg>
        <div
          style={{
            position: "relative", maxWidth: 1200, margin: "0 auto", boxSizing: "border-box", display: "flex", flexWrap: "wrap", alignItems: "center",
            padding: "clamp(48px, 7vw, 96px) 24px clamp(56px, 7vw, 96px)", gap: "clamp(32px, 5vw, 72px)",
          }}
        >
          <LineupHero />
        </div>
      </section>
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "clamp(40px, 5vw, 64px) 24px clamp(56px, 7vw, 96px)", boxSizing: "border-box", width: "100%" }}>
        <div
          className="o26-lineup-cta"
          style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 20, padding: "clamp(24px, 3vw, 36px)", borderRadius: 28, background: "rgba(244, 239, 226, 0.7)" }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <span className="o26-ff-fredoka" style={{ fontWeight: 600, fontSize: "clamp(24px, 2.6vw, 32px)" }}>Want to be in the room?</span>
            <span style={{ fontSize: 15, color: "#4A5160" }}>1,000 seats, first-come, first-served.</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <Link href={LINKS.dates} className="o26-cta-ghost" style={{ height: 54, padding: "0 24px", borderRadius: 27, fontSize: 15 }}>Key dates</Link>
            <Link href={LINKS.register} className="o26-cta o26-ff-fredoka" style={{ height: 54, padding: "0 28px", borderRadius: 27, fontSize: 18, boxShadow: "0 12px 26px rgba(249, 169, 11, 0.35)" }}>Save my seat</Link>
          </div>
        </div>
      </section>
    </BrandPage>
  );
}
