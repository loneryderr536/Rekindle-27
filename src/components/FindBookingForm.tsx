"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

/** Booking code + email → the guest's booking page (via POST /api/booking/lookup). */
export function FindBookingForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/booking/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publicCode: form.get("publicCode"), email: form.get("email") }),
      });
      if (res.ok) {
        const { accessToken } = (await res.json()) as { accessToken: string };
        router.push(`/booking/${encodeURIComponent(accessToken)}`);
        return;
      }
      setError(
        res.status === 429
          ? "Too many attempts. Please wait a few minutes and try again."
          : res.status === 404
            ? "No booking matches that code and email. Check both and try again."
            : "Something went wrong. Please try again.",
      );
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="field">
        <span>Booking code</span>
        <input name="publicCode" required maxLength={64} autoComplete="off" autoCapitalize="characters"
          spellCheck={false} placeholder="e.g. K7MQ2X" className="font-mono uppercase" />
        <small>Six letters and numbers, shown in your ticket email.</small>
      </label>
      <label className="field">
        <span>Email</span>
        <input name="email" type="email" required autoComplete="email" inputMode="email" />
        <small>The address you booked with.</small>
      </label>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? "Looking up…" : "Find my tickets"}
      </button>
    </form>
  );
}
