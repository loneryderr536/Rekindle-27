import { cookies } from "next/headers";
import Link from "next/link";
import { AdminLogout } from "@/components/AdminLogout";
import { getSession, SESSION_COOKIE } from "@/server/auth/session";

const LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/seats", label: "Seats" },
  { href: "/admin/tiers", label: "Tiers" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/scan", label: "Scan" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const jar = await cookies();
  const session = await getSession(jar.get(SESSION_COOKIE)?.value ?? "");
  // The sign-in page lives under /admin too, so only staff with an admin session get the nav.
  if (session?.role !== "admin") return children;
  return (
    <>
      <nav aria-label="Admin" className="bg-plum text-white">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-1 gap-y-1 px-4 py-2">
          <span className="font-display mr-3 text-lg font-bold text-marigold">Admin</span>
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-full px-3 py-1.5 text-sm font-semibold hover:bg-white/10">
              {l.label}
            </Link>
          ))}
          <span className="ml-auto">
            <AdminLogout />
          </span>
        </div>
      </nav>
      {children}
    </>
  );
}
