"use client";

import { useState } from "react";

export function ResendTicketsButton({ bookingId, disabled }: { bookingId: string; disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function resend() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/resend`, { method: "POST" });
      if (res.ok) setNote({ ok: true, text: "Tickets queued for sending." });
      else {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setNote({ ok: false, text: body?.error?.message ?? "Could not resend tickets." });
      }
    } catch {
      setNote({ ok: false, text: "Network problem. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" className="btn-primary" disabled={disabled || busy} onClick={resend}>
        {busy ? "Sending..." : "Resend tickets"}
      </button>
      {note && (
        <p role="status" className={note.ok ? "text-sm text-muted" : "text-sm text-danger"}>
          {note.text}
        </p>
      )}
    </div>
  );
}
