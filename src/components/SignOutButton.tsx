"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { guestSignOut } from "@/lib/guestSignOut";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setBusy(true);
    setFailed(false);
    try {
      await guestSignOut();
      router.push("/sign-in");
      router.refresh();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" className="btn-ghost" disabled={busy} onClick={signOut}>Sign out</button>
      {failed && <p role="alert" className="m-0 text-sm text-danger">Couldn&apos;t sign you out. Try again.</p>}
    </div>
  );
}
