"use client";

import Link from "next/link";
import { useState } from "react";
import { FlameLogo } from "@/components/landing/FlameLogo";
import { LINKS } from "@/components/landing/links";

const MENU = [
  { href: LINKS.home, label: "Home" },
  { href: LINKS.about, label: "About" },
  { href: LINKS.lineup, label: "Line-up" },
  { href: LINKS.dates, label: "Key dates" },
  { href: LINKS.faq, label: "FAQ" },
  { href: LINKS.register, label: "Register" },
];

type Props = {
  solid?: boolean;
  /** The page this header is on, so its link reads as current. */
  current?: "lineup" | "dates" | "register";
};

/**
 * The site header. On the landing page (`solid` off) it starts hidden and the scroll story fades it
 * in once the burning logo has risen into the logo slot; every other page shows it from the start.
 */
export function LandingHeader({ solid = false, current }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  const cur = (key: Props["current"]) => (current === key ? ("page" as const) : undefined);

  return (
    <header id="o26-header" className={solid ? "o26-header-solid" : undefined}>
      <nav aria-label="Main" className="o26-nav">
        <div className="o26-hl">
          <a className="o26-hlink o26-hdesk" href={LINKS.home}>Home</a>
          <a className="o26-hlink o26-hdesk" href={LINKS.about}>About</a>
          <button
            type="button"
            className="o26-hmob o26-menu-btn"
            aria-label="Menu"
            aria-expanded={menuOpen}
            aria-controls="o26-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? (
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            ) : (
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M4 8h16M4 15h10" />
              </svg>
            )}
          </button>
        </div>
        <a href={LINKS.home} aria-label="ONE·26 Rekindle — back to top" className="o26-logo-link">
          <span id="o26-hlogo" className="o26-logo-glow">
            <FlameLogo ignite={false} glow={false} />
          </span>
        </a>
        <div className="o26-hr">
          <Link className="o26-hlink o26-hdesk" href={LINKS.lineup} aria-current={cur("lineup")}>Line-up</Link>
          <Link className="o26-hlink o26-hdesk" href={LINKS.register} aria-current={cur("register")}>Register</Link>
          <Link className="o26-hmob o26-mob-cta" href={LINKS.register}>Register</Link>
        </div>
        {menuOpen && (
          <div id="o26-menu" className="o26-menu">
            {MENU.map((item, i) => {
              const content = (
                <>
                  <span className="o26-menu-num">{String(i + 1).padStart(2, "0")}</span>
                  {item.label}
                </>
              );
              // Section links are plain anchors so the landing page loads fresh (its story starts on mount).
              return item.href.includes("#") ? (
                <a key={item.label} href={item.href} onClick={closeMenu} className="o26-ff-fredoka">{content}</a>
              ) : (
                <Link key={item.label} href={item.href} onClick={closeMenu} className="o26-ff-fredoka">{content}</Link>
              );
            })}
          </div>
        )}
      </nav>
    </header>
  );
}
