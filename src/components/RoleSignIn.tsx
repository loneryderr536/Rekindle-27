"use client";

import { useState } from "react";
import { AdminLoginForm } from "@/components/AdminLoginForm";
import { GuestSignIn } from "@/components/GuestSignIn";

type Role = "guest" | "admin" | "scanner";

const TABS: { role: Role; label: string }[] = [
  { role: "guest", label: "I'm attending" },
  { role: "admin", label: "Admin" },
  { role: "scanner", label: "Gatekeeper" },
];

const STAFF_COPY: Record<"admin" | "scanner", string> = {
  admin: "Box office and admin staff: sign in to reach the dashboard.",
  scanner: "Gate staff: sign in to open the ticket scanner.",
};

/**
 * One sign-in experience for every kind of visitor: a guest picking up their tickets, or staff
 * (admin/gatekeeper) reaching their own tools. The tab picked only changes what form is shown —
 * the account's real role (from the server) always decides where a staff sign-in lands.
 */
export function RoleSignIn({ next, defaultRole = "guest", denied }: { next: string; defaultRole?: Role; denied?: boolean }) {
  const [role, setRole] = useState<Role>(defaultRole);
  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Sign in as" className="flex gap-1 rounded-full bg-sand p-1">
        {TABS.map((t) => (
          <button
            key={t.role}
            type="button"
            role="tab"
            aria-selected={role === t.role}
            onClick={() => setRole(t.role)}
            className={`flex min-h-11 flex-1 items-center justify-center rounded-full px-1.5 py-2 text-center text-[13px] font-semibold leading-tight transition-colors sm:px-3 sm:text-sm ${
              role === t.role ? "bg-marigold text-ink" : "text-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {role === "guest" ? (
        <GuestSignIn next={next} />
      ) : (
        <div className="space-y-4">
          <p className="m-0 text-sm text-muted">{STAFF_COPY[role]}</p>
          <AdminLoginForm denied={role === defaultRole && !!denied} />
        </div>
      )}
    </div>
  );
}
