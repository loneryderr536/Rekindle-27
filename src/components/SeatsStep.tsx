"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { BookingApp } from "@/components/BookingApp";
import { clearHoldToken, readHoldToken } from "@/lib/activeHold";
import { attendeeStore, clearAttendee, isForeignAttendee, parseAttendee } from "@/lib/attendee";

/** /register/seats: needs the details from /register, unless this browser is resuming a hold. */
export function SeatsStep({ guestEmail }: { guestEmail: string }) {
  const router = useRouter();
  const raw = useSyncExternalStore<string | null | undefined>(
    attendeeStore.subscribe,
    attendeeStore.getSnapshot,
    attendeeStore.getServerSnapshot,
  );
  const stored = parseAttendee(raw);
  // Details (and a hold) left by another account in this tab must not carry over to this one.
  const foreign = isForeignAttendee(stored, guestEmail);
  const attendee = foreign ? null : stored;
  const missing = raw !== undefined && (foreign || (attendee === null && readHoldToken() === null));

  useEffect(() => {
    if (foreign) {
      clearAttendee();
      clearHoldToken();
    }
    if (missing) router.replace("/register");
  }, [foreign, missing, router]);

  if (raw === undefined || missing) {
    return <p className="o26-wrap w-full px-6 py-16 text-muted" aria-live="polite">Loading…</p>;
  }
  return <BookingApp attendee={attendee} />;
}
