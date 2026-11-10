"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { FlameLogo } from "@/components/landing/FlameLogo";

export type StaffLink = { href: string; label: string };

function Title({ title }: { title: string }) {
  return (
    <>
      <span className="o26-admin-logo" aria-hidden="true">
        <FlameLogo ignite={false} glow={false} small />
      </span>
      {title}
    </>
  );
}

/**
 * The staff header shell: the same navy-textured bar as the public site.
 * Desktop shows the title and every link in one row. On a phone it matches the public header instead:
 * a menu button on the left that opens the links, the title in the middle, and the trailing action
 * (`children`, e.g. Log out) as a pill on the right.
 */
export function StaffBar({ title, links = [], children }: { title: string; links?: StaffLink[]; children?: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest("#o26-staff-menu") && !target?.closest(".o26-admin-menu-btn")) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <header id="o26-header" className="o26-header-solid">
      <div className="o26-admin-bar">
        {/* Desktop */}
        <span className="o26-admin-title o26-admin-desk">
          <Title title={title} />
        </span>
        {(links.length > 0 || children) && (
          <nav aria-label={title} className="o26-admin-links o26-admin-desk">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="o26-hlink" aria-current={pathname === l.href ? "page" : undefined}>
                {l.label}
              </Link>
            ))}
            {children}
          </nav>
        )}

        {/* Phone */}
        <div className="o26-admin-mob">
          <div className="o26-admin-mob-l">
            {links.length > 0 && (
              <button
                type="button"
                className="o26-menu-btn o26-admin-menu-btn"
                aria-label="Menu"
                aria-expanded={menuOpen}
                aria-controls="o26-staff-menu"
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
            )}
          </div>
          <span className="o26-admin-title o26-admin-title-m">
            <Title title={title} />
          </span>
          <div className="o26-admin-mob-r">{children}</div>
        </div>

        {menuOpen && links.length > 0 && (
          <div id="o26-staff-menu" className="o26-menu o26-admin-menu">
            {links.map((l, i) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={closeMenu}
                className="o26-ff-fredoka"
                aria-current={pathname === l.href ? "page" : undefined}
              >
                <span className="o26-menu-num">{String(i + 1).padStart(2, "0")}</span>
                {l.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
