import { cookies } from "next/headers";
import { AdminHeader } from "@/components/AdminHeader";
import { getSession, SESSION_COOKIE } from "@/server/auth/session";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const jar = await cookies();
  const session = await getSession(jar.get(SESSION_COOKIE)?.value ?? "");
  // The sign-in page lives under /admin too, so only staff with an admin session get the nav.
  const signedIn = session?.role === "admin";
  return (
    <div id="o26-root" className="flex flex-1 flex-col">
      <div className="o26-glass" aria-hidden="true" />
      {signedIn && <AdminHeader />}
      {/* A div, not <main>: each page below already renders its own <main>. */}
      <div className="relative z-10 flex flex-1 flex-col">{children}</div>
    </div>
  );
}
