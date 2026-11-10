import { AdminLogout } from "@/components/AdminLogout";
import { StaffBar, type StaffLink } from "@/components/StaffBar";

const LINKS: StaffLink[] = [
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
  return (
    <StaffBar title="Admin" links={LINKS}>
      <AdminLogout />
    </StaffBar>
  );
}
