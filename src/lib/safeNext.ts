const DEFAULT_NEXT = "/my-bookings";

/** A same-site path to redirect to after sign-in; anything else (absolute URLs, `//host`, `/\host`) falls back to My bookings. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return DEFAULT_NEXT;
  return next;
}
