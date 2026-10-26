import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { LINKS, LOGO } from "@/components/landing/links";

function FlameIcon({ width = 14, height = 18, fill = "#FF4520" }: { width?: number; height?: number; fill?: string }) {
  return (
    <svg aria-hidden="true" width={width} height={height} viewBox="0 0 14 18" fill={fill}>
      <path d="M7 0C9 4 13 6 13 11a6 6 0 0 1-12 0c0-3 2-4 3-7 1 2 1 3 2 4 1-3 0-5 1-8z" />
    </svg>
  );
}

function Arrow() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

const strokeIcon = (d: string) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const STEPS: { bg: string; fg: string; icon: ReactNode; k: string; title: string; body: string }[] = [
  {
    bg: "#F9A90B", fg: "#0B1020", k: "01 · THE SPARK", title: "We gather and pray",
    body: "The night opens in prayer. One small spark is all it takes.",
    icon: strokeIcon("M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"),
  },
  {
    bg: "#0A5470", fg: "#FDFBF4", k: "02 · THE WORD", title: "Scripture at the centre",
    body: "A message to stir up the gift of God in you. [SPEAKER / MESSAGE]",
    icon: strokeIcon("M2 5h6a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2zM22 5h-6a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h7z"),
  },
  {
    bg: "#FF4520", fg: "#0B1020", k: "03 · THE FLAME", title: "Worship as one",
    body: "Live worship with Immanuel Henry & Unarv Band — a whole room singing together.",
    icon: <FlameIcon width={22} height={26} fill="currentColor" />,
  },
  {
    bg: "#0B1020", fg: "#F9A90B", k: "04 · CARRY IT HOME", title: "Keep it burning",
    body: "Leave with the fire still lit — at home, on campus, at work and in church.",
    icon: strokeIcon("M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"),
  },
];

const PLAN = [
  {
    href: LINKS.lineup, bg: "#0B1020", fg: "#FDFBF4", kColor: "#F9A90B", k: "01 · LINE-UP", title: "Leading the evening",
    body: "Immanuel Henry & Unarv Band — worship and live music.", go: "See the line-up",
  },
  {
    href: LINKS.dates, bg: "#0A5470", fg: "#FDFBF4", kColor: "#F9A90B", k: "02 · KEY DATES", title: "Mark your calendar",
    body: "When registration opens, when it closes, and the night itself.", go: "See key dates",
  },
  {
    href: LINKS.register, bg: "#F9A90B", fg: "#0B1020", kColor: "#0B1020", k: "03 · REGISTRATION", title: "Save your seat",
    body: "Four quick details. Your pass arrives on WhatsApp.", go: "Register now",
  },
];

const FAQ = [
  { q: "Who is ONE·26 for?", a: "It's planned with young people in mind, and everyone is welcome — friends, families and first-timers.", open: true },
  { q: "Is there an entry fee?", a: "[ANSWER]" },
  { q: "Can I bring friends?", a: "Yes — add them when you register and we'll keep your seats together." },
  { q: "Where do I park?", a: "[PARKING INFO]" },
];

export function RekindleSection() {
  return (
    <section id="rekindle">
      <div className="o26-wrap">
        <div className="o26-col" style={{ gap: 18 }}>
          <span className="o26-eyebrow"><FlameIcon />ONE·26 · This year&apos;s theme</span>
          <h1 className="o26-h1 o26-ff-fredoka">What is <span className="o26-hot">Rekindle</span>?</h1>
          <p className="o26-lead">
            Rekindle is a call to a generation whose fire for God has grown quiet. Many of us once burned bright — in
            worship, in prayer, in the Word — and slowly cooled. ONE·26 sets one night apart to stir that flame back to
            life, together: one nation, one youth, one fire.
          </p>
          <p className="o26-lead">It isn&apos;t a new fire we&apos;re chasing. It&apos;s the one God already placed in you.</p>
          <blockquote className="o26-quote o26-ff-fredoka">
            “Stir up the gift of God, which is in thee.”
            <cite className="o26-ff-poppins">2 TIMOTHY 1:6</cite>
          </blockquote>
          <div className="o26-ctas">
            <Link href={LINKS.register} className="o26-cta o26-ff-fredoka">Save my seat</Link>
            <a href={LINKS.lineup} className="o26-cta-ghost">See the line-up</a>
          </div>
        </div>
        <div className="o26-col" style={{ gap: 16 }}>
          <h2 className="o26-h-steps o26-ff-fredoka">How it&apos;s done</h2>
          <ol id="steps">
            {STEPS.map((s) => (
              <li key={s.k}>
                <span className="o26-step-ic" aria-hidden="true" style={{ background: s.bg, color: s.fg }}>{s.icon}</span>
                <div className="o26-step-body">
                  <span className="o26-step-k">{s.k}</span>
                  <span className="o26-step-t o26-ff-fredoka">{s.title}</span>
                  <span className="o26-step-d">{s.body}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

export function AboutSection() {
  return (
    <section id="about" className="o26-wrap">
      <div>
        <span className="o26-eyebrow"><FlameIcon />Every 26 January</span>
        <h2 className="o26-h-about o26-ff-fredoka">Not a show. <span className="o26-hot">An encounter.</span></h2>
      </div>
      <div>
        <p>
          ONE·26 is a yearly evening of worship, Scripture and live music, presented by the Christos Marthoma Yuvajana
          Sakyam &amp; Young Family Fellowship. It&apos;s planned with the young people of our nation in mind — and
          everyone is welcome.
        </p>
        <p>
          “O sing unto the Lord a new song: sing unto the Lord, all the earth.” <span className="o26-ref">— Psalm 96:1</span>
        </p>
      </div>
    </section>
  );
}

export function PlanSection() {
  return (
    <section id="plan" className="o26-wrap">
      <div className="o26-plan-head">
        <h2 className="o26-h2 o26-ff-fredoka">Plan your night <span className="o26-hot">•</span></h2>
        <span className="o26-plan-sub">Everything has its own page.</span>
      </div>
      <div className="o26-plan">
        {PLAN.map((c) => {
          const body = (
            <>
              <span className="o26-plan-k" style={{ color: c.kColor }}>{c.k}</span>
              <span className="o26-plan-t o26-ff-fredoka">{c.title}</span>
              <span className="o26-plan-d">{c.body}</span>
              <span style={{ flexGrow: 1 }} />
              <span className="o26-plan-go">{c.go}<Arrow /></span>
            </>
          );
          const style = { background: c.bg, color: c.fg };
          return c.href.startsWith("/") ? (
            <Link key={c.k} href={c.href} style={style}>{body}</Link>
          ) : (
            <a key={c.k} href={c.href} style={style}>{body}</a>
          );
        })}
      </div>
    </section>
  );
}

export function FaqSection() {
  return (
    <section id="faq">
      <div className="o26-wrap">
        <div className="o26-faq-l">
          <h2 className="o26-h2 o26-ff-fredoka">Good to know <span className="o26-hot">•</span></h2>
          <div role="img" aria-label="Map placeholder" className="o26-map">[MAP · VENUE ADDRESS]</div>
        </div>
        <div className="o26-faq-r">
          {FAQ.map((f) => (
            <details key={f.q} open={f.open}>
              <summary className="o26-ff-fredoka">{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="o26-footer">
      <div className="o26-wrap">
        <div className="o26-foot-brand">
          <Image src={LOGO.src} width={LOGO.width} height={LOGO.height} alt="ONE·26 Rekindle logo" />
          <div className="o26-foot-name">
            <span className="o26-foot-title o26-ff-fredoka">ONE·26</span>
            <span className="o26-foot-org">Christos Marthoma Yuvajana Sakyam &amp; Young Family Fellowship</span>
          </div>
        </div>
        <div className="o26-foot-links">
          <a href={LINKS.lineup}>Line-up</a>
          <a href={LINKS.dates}>Key dates</a>
          <Link href={LINKS.register}>Register</Link>
          <a href={LINKS.faq}>FAQ</a>
          <span>[INSTAGRAM]</span>
          <span>[CONTACT NUMBER]</span>
        </div>
      </div>
    </footer>
  );
}
