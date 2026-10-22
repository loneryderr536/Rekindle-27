"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the current server page every `ms` while mounted. */
export function AutoRefresh({ ms }: { ms: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), ms);
    return () => clearInterval(t);
  }, [router, ms]);
  return null;
}
