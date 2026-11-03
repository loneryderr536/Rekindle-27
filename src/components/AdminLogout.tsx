"use client";

import { useRouter } from "next/navigation";

export function AdminLogout() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    router.push("/admin/login");
  }
  return (
    <button type="button" className="o26-hlink" onClick={logout}>
      Log out
    </button>
  );
}
