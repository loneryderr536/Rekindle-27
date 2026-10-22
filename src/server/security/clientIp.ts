/** Best-effort client IP: first `x-forwarded-for` entry, else `x-real-ip`, else "unknown". */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
