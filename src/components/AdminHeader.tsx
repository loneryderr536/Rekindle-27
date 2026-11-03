"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminLogout } from "@/components/AdminLogout";
import { StaffBar } from "@/components/StaffBar";

const LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/checkins", label: "Check-ins" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/seats", label: "Seats" },
  { href: "/admin/seat-designer", label: "Seat designer" },
  { href: "/admin/tiers", label: "Tiers" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/scan", label: "Scan" },
];

/** The admin nav, in the same navy-textured bar as the public site and the gate scanner. */
export function AdminHeader() {
  const pathname = usePathname();
  return (
    <StaffBar title="Admin">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className="o26-hlink" aria-current={pathname === l.href ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
      <AdminLogout />
    </StaffBar>
  );
}
