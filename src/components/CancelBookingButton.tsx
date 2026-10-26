"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CancelBookingButton(
  { bookingId, publicCode, comp }: { bookingId: string; publicCode: string; comp: boolean },
) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function cancel() {
    const what = comp ? "void its tickets and free its seats" : "void its tickets, free its seats and refund the full amount";
    if (!window.confirm(`Cancel booking ${publicCode}, ${what}?`)) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/cancel`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { status?: string; error?: { message?: string } } | null;
      if (res.ok) {
        setNote({
          ok: true,
          text: body?.status === "refunded"
            ? "Booking cancelled and refunded."
            : body?.status === "cancelled"
              ? "Booking cancelled. The guest has been emailed."
              : "Booking cancelled. The refund will be retried automatically in a few minutes.",
        });
        router.refresh();
      } else {
        setNote({ ok: false, text: body?.error?.message ?? "Could not cancel the booking." });
      }
    } catch {
      setNote({ ok: false, text: "Network problem. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" className="btn-ghost text-danger" disabled={busy} onClick={cancel}>
        {busy ? "Cancelling..." : comp ? "Cancel comp" : "Cancel & refund"}
      </button>
      {note && (
        <p role="status" className={note.ok ? "text-sm text-muted" : "text-sm text-danger"}>
          {note.text}
        </p>
      )}
    </div>
  );
}
