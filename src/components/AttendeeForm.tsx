"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { attendeeStore, parseAttendee, saveAttendee, type Attendee } from "@/lib/attendee";
import { MAX_SEATS_PER_BOOKING } from "@/lib/constants";
import { normalizeIndianPhone } from "@/lib/phone";

/** Step 1 of registration: who is coming and how many seats they need. */
export function AttendeeForm() {
  const raw = useSyncExternalStore<string | null | undefined>(
    attendeeStore.subscribe,
    attendeeStore.getSnapshot,
    attendeeStore.getServerSnapshot,
  );
  // Remount once the stored details are read, so "Edit details" comes back with the form filled in.
  return <DetailsForm key={raw ?? "new"} initial={parseAttendee(raw)} />;
}

function DetailsForm({ initial }: { initial: Attendee | null }) {
  const router = useRouter();
  const [participants, setParticipants] = useState(initial?.participants ?? 1);
  const [phoneError, setPhoneError] = useState(false);
  const [busy, setBusy] = useState(false);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const phone = String(data.get("phone") ?? "").trim();
    if (normalizeIndianPhone(phone) === null) {
      setPhoneError(true);
      e.currentTarget.querySelector<HTMLInputElement>('input[name="phone"]')?.focus();
      return;
    }
    setBusy(true);
    saveAttendee({
      name: String(data.get("name") ?? "").trim(),
      email: String(data.get("email") ?? "").trim(),
      phone,
      participants,
    });
    router.push("/register/seats");
  }

  const step = (by: number) => setParticipants((n) => Math.min(MAX_SEATS_PER_BOOKING, Math.max(1, n + by)));

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <label className="field">
        <span>Full name</span>
        <input name="name" required minLength={2} maxLength={80} autoComplete="name" defaultValue={initial?.name} />
      </label>
      <label className="field">
        <span>Email</span>
        <input name="email" type="email" required autoComplete="email" inputMode="email" defaultValue={initial?.email} />
        <small>Your tickets are sent here.</small>
      </label>
      <label className="field">
        <span>Mobile number</span>
        <input
          name="phone"
          type="tel"
          required
          autoComplete="tel"
          inputMode="tel"
          placeholder="98765 43210"
          defaultValue={initial?.phone}
          aria-invalid={phoneError}
          aria-describedby="phone-help"
          onChange={() => phoneError && setPhoneError(false)}
        />
        <small id="phone-help" className={phoneError ? "!text-danger font-medium" : undefined}>
          {phoneError ? "Enter a 10-digit Indian mobile number." : "Indian mobile numbers only."}
        </small>
      </label>

      <div className="field">
        <span id="participants-label">Number of participants</span>
        <div className="flex items-center gap-3" role="group" aria-labelledby="participants-label">
          <button type="button" className="o26-stepper" aria-label="Fewer participants" disabled={participants <= 1} onClick={() => step(-1)}>
            &minus;
          </button>
          <output
            className="font-display min-w-[3ch] text-center text-4xl font-semibold tabular-nums"
            aria-live="polite"
            aria-label={`${participants} ${participants === 1 ? "participant" : "participants"}`}
          >
            {participants}
          </output>
          <button
            type="button"
            className="o26-stepper"
            aria-label="More participants"
            disabled={participants >= MAX_SEATS_PER_BOOKING}
            onClick={() => step(1)}
          >
            +
          </button>
          <span className="text-sm text-muted">
            {participants === 1 ? "Just me" : `You + ${participants - 1} ${participants === 2 ? "friend" : "friends"}`}
          </span>
        </div>
        <small>One seat each, up to {MAX_SEATS_PER_BOOKING} per booking. You&apos;ll pick them next.</small>
      </div>

      <p className="m-0 text-sm text-muted">We use your name, email and phone only for this booking and its tickets.</p>

      <button type="submit" className="btn-primary flex items-center justify-center gap-2" disabled={busy}>
        {busy ? "One moment…" : `Choose ${participants === 1 ? "my seat" : `${participants} seats`}`}
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </form>
  );
}
