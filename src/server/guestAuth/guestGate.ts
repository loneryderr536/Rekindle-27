/** Where a signed-out guest should be sent instead of `pathname`, or null to let the request through. */
export function guestGate(pathname: string, search: string, signedIn: boolean): string | null {
  if (signedIn) return null;
  if (pathname === "/register/seats" || pathname.startsWith("/register/seats/")) return "/register";
  if (pathname === "/my-bookings" || pathname.startsWith("/my-bookings/")) {
    return "/sign-in?next=" + encodeURIComponent(pathname + search);
  }
  return null;
}
