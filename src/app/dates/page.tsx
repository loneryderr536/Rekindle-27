import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandPage } from "@/components/landing/BrandPage";
import { LINKS } from "@/components/landing/links";

export const metadata: Metadata = {
  title: "Key dates",
  description: "When registration opens and closes, and the night of ONE·26 Rekindle on 26 January 2027.",
};

type DateRow = { day: string; mon: string; dayColor: string; title: string; note: string; cta: string; solid?: boolean; delay: string };

const ROWS: DateRow[] = [
  { day: "[DD]", mon: "[MON]", dayColor: "#0A5470", title: "Registration opens", note: "Seats are first-come, first-served", cta: "Register", delay: "p-d3" },
  { day: "[DD]", mon: "[MON]", dayColor: "#0A5470", title: "Registration closes", note: "Or sooner, once all 1,000 seats are taken", cta: "Remind me", delay: "p-d4" },
  { day: "26", mon: "JAN", dayColor: "#FF4520", title: "ONE·26 night", note: "Gates open [TIME] · Starts [TIME]", cta: "Save my seat", solid: true, delay: "p-d5" },
];

function icon(d: ReactNode) {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  );
}

const FACTS: { bg: string; fg: string; icon: ReactNode; label: string; value: string; delay: string }[] = [
  {
    bg: "#0A5470", fg: "#FDFBF4", label: "Venue", value: "[VENUE], [CITY]", delay: "p-d4",
    icon: icon(<><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>),
  },
  {
    bg: "#0B1020", fg: "#FDFBF4", label: "Gates open", value: "[TIME]", delay: "p-d5",
    icon: icon(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  },
  {
    bg: "#F9A90B", fg: "#0B1020", label: "Entry", value: "[FREE / ₹—]", delay: "p-d5",
    icon: icon(<><path d="M3 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a3 3 0 0 0 0-6V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" /><path d="M13 5v2M13 11v2M13 17v2" /></>),
  },
];

export default function DatesPage() {
  return (
    <BrandPage current="dates">
      <section className="o26-navy" style={{ position: "relative", overflow: "hidden", color: "#FDFBF4", borderRadius: "0 0 48px 48px" }}>
        <div
          style={{
            position: "relative", maxWidth: 1200, margin: "0 auto", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 16,
            padding: "clamp(56px, 8vw, 104px) 24px clamp(56px, 7vw, 96px)",
          }}
        >
          <span className="p-in p-d1 p-eyebrow">ONE·26 · [VENUE], [CITY]</span>
          <h1 className="p-in p-d2 p-h1 o26-ff-fredoka" style={{ fontSize: "clamp(46px, 7vw, 92px)" }}>
            Key dates <span style={{ color: "#F9A90B" }}>•</span>
          </h1>
          <p className="p-in p-d3 p-lead" style={{ maxWidth: 620 }}>
            Everything you need to plan for, from the day registration opens to the night itself.
          </p>
        </div>
      </section>
      <section style={{ maxWidth: 900, margin: "0 auto", width: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", padding: "clamp(40px, 6vw, 72px) 24px clamp(24px, 3vw, 40px)" }}>
        {ROWS.map((r, i) => (
          <div key={r.title} style={{ display: "contents" }}>
            {i > 0 && <div aria-hidden="true" style={{ marginLeft: 55, height: 26, borderLeft: "2px dotted #F9A90B" }} />}
            <div className={`p-in ${r.delay} o26-date-row`}>
              <div className="o26-date-badge o26-ff-fredoka">
                <b style={{ color: r.dayColor }}>{r.day}</b>
                {r.mon}
              </div>
              <div style={{ flex: "1 1 200px", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <span className="o26-ff-fredoka" style={{ fontWeight: 600, fontSize: 23 }}>{r.title}</span>
                <span style={{ fontSize: 14, color: "#4A5160" }}>{r.note}</span>
              </div>
              <Link href={LINKS.register} className={`o26-date-cta${r.solid ? " o26-date-cta-solid" : ""}`}>{r.cta}</Link>
            </div>
          </div>
        ))}
      </section>
      <section style={{ maxWidth: 900, margin: "0 auto", width: "100%", boxSizing: "border-box", padding: "0 24px clamp(56px, 7vw, 96px)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))", gap: 16 }}>
          {FACTS.map((f) => (
            <div key={f.label} className={`p-in ${f.delay}`} style={{ padding: "22px 24px", borderRadius: 24, background: f.bg, color: f.fg, display: "flex", flexDirection: "column", gap: 10 }}>
              {f.icon}
              <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.85 }}>{f.label}</span>
              <span className="o26-ff-fredoka" style={{ fontWeight: 600, fontSize: 24 }}>{f.value}</span>
            </div>
          ))}
        </div>
      </section>
    </BrandPage>
  );
}
