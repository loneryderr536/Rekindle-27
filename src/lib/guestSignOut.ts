import { clearHoldToken } from "@/lib/activeHold";
import { clearAttendee } from "@/lib/attendee";

/** Ends the guest session, then forgets this browser's attendee details and hold so the next account cannot resume them. */
export async function guestSignOut(): Promise<void> {
  try {
    await fetch("/api/auth/sign-out", { method: "POST" });
  } finally {
    clearAttendee();
    clearHoldToken();
  }
}
