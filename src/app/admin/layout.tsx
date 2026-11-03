import { cookies } from "next/headers";
import { AdminHeader } from "@/components/AdminHeader";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { getSession, SESSION_COOKIE } from "@/server/auth/session";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const jar = await cookies();
  const session = await getSession(jar.get(SESSION_COOKIE)?.value ?? "");
  // The sign-in page lives under /admin too, so only staff with an admin session get the admin nav;
  // everyone else (including a signed-out visitor on that sign-in page) sees the same public header
  // as the rest of the site, for a consistent look.
  const signedIn = session?.role === "admin";
  return (
    <div id="o26-root" className="flex flex-1 flex-col">
      <div className="o26-glass" aria-hidden="true" />
      {signedIn ? <AdminHeader /> : <LandingHeader solid />}
      {/* A div, not <main>: each page below already renders its own <main>. */}
      <div className="relative z-10 flex flex-1 flex-col">{children}</div>
    </div>
  );
}
