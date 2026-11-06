import { MAX_SEATS_PER_BOOKING } from "@/lib/constants";

/** Who is booking and for how many people; entered on /register, used on /register/seats. */
export type Attendee = { name: string; email: string; phone: string; participants: number };

const KEY = "attendee";

/** Kept in this tab only (sessionStorage), and cleared once the booking is paid. */
export function saveAttendee(a: Attendee): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    // Storage unavailable: the seats page sends the guest back to the details form.
  }
}

/** The stored JSON as-is; a string snapshot keeps useSyncExternalStore stable between renders. */
export function readAttendeeRaw(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearAttendee(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function parseAttendee(raw: string | null | undefined): Attendee | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Attendee>;
    if (typeof v.name !== "string" || typeof v.email !== "string" || typeof v.phone !== "string") return null;
    const n = Number(v.participants);
    if (!Number.isInteger(n) || n < 1 || n > MAX_SEATS_PER_BOOKING) return null;
    return { name: v.name, email: v.email, phone: v.phone, participants: n };
  } catch {
    return null;
  }
}

const noopSubscribe = () => () => {};

/** For useSyncExternalStore: the stored attendee never changes underneath a mounted page. */
export const attendeeStore = {
  subscribe: noopSubscribe,
  getSnapshot: readAttendeeRaw,
  /** `undefined` on the server and during hydration: "not read yet", as opposed to `null`, "none stored". */
  getServerSnapshot: (): string | null | undefined => undefined,
};
