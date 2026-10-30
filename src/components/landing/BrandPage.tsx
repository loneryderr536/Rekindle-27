import type { ReactNode } from "react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/Sections";

/**
 * Guest pages outside the landing page: the site header, the paper page and the footer.
 * `dark` makes the whole page the night-navy stage of the seat map ("seats") or the digital ticket ("ticket").
 */
export function BrandPage({
  children,
  footer = true,
  dark,
  current,
}: {
  children: ReactNode;
  footer?: boolean;
  dark?: "seats" | "ticket";
  current?: "lineup" | "dates" | "register" | "my-bookings";
}) {
  return (
    <div id="o26-root" className={`flex flex-1 flex-col${dark ? ` o26-dark o26-dark-${dark}` : ""}`}>
      <div className="o26-glass" aria-hidden="true" />
      <LandingHeader solid current={current} />
      <main className="flex flex-1 flex-col">{children}</main>
      {footer && <LandingFooter />}
    </div>
  );
}

/** Eyebrow, big Fredoka title and an optional lead line, as on the landing page sections. */
export function PageIntro({ eyebrow, title, lead }: { eyebrow: string; title: ReactNode; lead?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="o26-eyebrow">
        <svg aria-hidden="true" width="14" height="18" viewBox="0 0 14 18" fill="#FF4520">
          <path d="M7 0C9 4 13 6 13 11a6 6 0 0 1-12 0c0-3 2-4 3-7 1 2 1 3 2 4 1-3 0-5 1-8z" />
        </svg>
        {eyebrow}
      </span>
      <h1 className="font-display m-0 text-[clamp(38px,5.4vw,64px)] font-semibold leading-[1]">{title}</h1>
      {lead && <p className="o26-lead">{lead}</p>}
    </div>
  );
}

const STEPS = ["Your details", "Pick seats", "Pay"];

/** The three-step progress line shown across the registration pages. */
export function RegisterSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Registration steps">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "now" : "next";
        return (
          <li
            key={label}
            aria-current={state === "now" ? "step" : undefined}
            className={`flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold ${
              state === "now" ? "bg-marigold text-ink" : state === "done" ? "bg-paper text-ink" : "bg-paper/10 text-paper/80 ring-1 ring-paper/25"
            }`}
          >
            <span className="font-display">{String(n).padStart(2, "0")}</span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}
