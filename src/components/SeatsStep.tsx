"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { BookingApp } from "@/components/BookingApp";
import { readHoldToken } from "@/lib/activeHold";
import { attendeeStore, parseAttendee } from "@/lib/attendee";

/** /register/seats: needs the details from /register, unless this browser is resuming a hold. */
export function SeatsStep() {
  const router = useRouter();
  const raw = useSyncExternalStore<string | null | undefined>(
    attendeeStore.subscribe,
    attendeeStore.getSnapshot,
    attendeeStore.getServerSnapshot,
  );
  const attendee = parseAttendee(raw);
  const missing = raw !== undefined && attendee === null && readHoldToken() === null;

  useEffect(() => {
    if (missing) router.replace("/register");
  }, [missing, router]);

  if (raw === undefined || missing) {
    return <p className="o26-wrap w-full px-6 py-16 text-muted" aria-live="polite">Loading…</p>;
  }
  return <BookingApp attendee={attendee} />;
}
