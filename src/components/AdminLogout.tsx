"use client";

import { useRouter } from "next/navigation";

export function AdminLogout() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    router.push("/admin/login");
  }
  return (
    <button type="button" className="rounded-full px-3 py-1.5 text-sm font-semibold hover:bg-white/10" onClick={logout}>
      Log out
    </button>
  );
}
