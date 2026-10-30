import { clearHoldToken } from "@/lib/activeHold";
import { clearAttendee } from "@/lib/attendee";

/**
 * Ends the guest session, then forgets this browser's attendee details and hold so the next account cannot resume them.
 * Rejects when the server did not sign the guest out; local data is cleared either way.
 */
export async function guestSignOut(): Promise<void> {
  try {
    const res = await fetch("/api/auth/sign-out", { method: "POST" });
    if (!res.ok) throw new Error(`Sign-out failed (${res.status})`);
  } finally {
    clearAttendee();
    clearHoldToken();
  }
}
