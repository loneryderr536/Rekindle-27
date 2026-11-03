import type { ReactNode } from "react";
import { FlameLogo } from "@/components/landing/FlameLogo";

/** The staff header shell: the same navy-textured bar as the public site, with a title and nav slot. */
export function StaffBar({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header id="o26-header" className="o26-header-solid">
      <div className="o26-admin-bar">
        <span className="o26-admin-title">
          <span id="o26-admin-logo" aria-hidden="true">
            <FlameLogo ignite={false} glow={false} small />
          </span>
          {title}
        </span>
        {children && (
          <nav aria-label={title} className="o26-admin-links">
            {children}
          </nav>
        )}
      </div>
    </header>
  );
}
