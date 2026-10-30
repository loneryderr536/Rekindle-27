const DEFAULT_NEXT = "/my-bookings";

/**
 * A same-site path to redirect to after sign-in; anything else falls back to My bookings.
 * Browsers strip tab/LF/CR from URLs, so control characters are rejected and the
 * result is also resolved against a dummy origin to confirm it stays same-site.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return DEFAULT_NEXT;
  for (let i = 0; i < next.length; i++) {
    const c = next.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return DEFAULT_NEXT;
  }
  try {
    if (new URL(next, "http://x").origin !== "http://x") return DEFAULT_NEXT;
  } catch {
    return DEFAULT_NEXT;
  }
  return next;
}
