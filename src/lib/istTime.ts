const fmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
});

/** e.g. "5 Nov, 6:30 pm" in IST, so staff see the same time regardless of server region. */
export function formatIst(d: Date): string {
  return fmt.format(d);
}
