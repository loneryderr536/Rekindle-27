"use client";

import { useState } from "react";

type State = "idle" | "sending" | "sent" | "limited" | "failed";

/** Emails the booking's tickets again; the server rate-limits to three a hour. */
export function ResendMyTicketsButton({ bookingId }: { bookingId: string }) {
  const [state, setState] = useState<State>("idle");

  async function resend() {
    setState("sending");
    try {
      const res = await fetch(`/api/my-bookings/${encodeURIComponent(bookingId)}/resend`, { method: "POST" });
      setState(res.ok ? "sent" : res.status === 429 ? "limited" : "failed");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button type="button" className="btn-ghost" disabled={state === "sending"} onClick={resend}>
        Resend ticket email
      </button>
      <p className="m-0 text-sm" role={state === "failed" || state === "limited" ? "alert" : "status"} aria-live="polite">
        {state === "sent" && "Sent. Check your inbox."}
        {state === "limited" && "Already resent recently. Try again in an hour."}
        {state === "failed" && "Couldn't send the email. Try again."}
      </p>
    </div>
  );
}
