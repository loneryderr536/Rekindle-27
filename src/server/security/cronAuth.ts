import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Accepts `x-cron-secret: <CRON_SECRET>` or `Authorization: Bearer <CRON_SECRET>` (what Vercel Cron sends). */
export function assertCron(req: Request): void {
  const secret = env.CRON_SECRET;
  const bearer = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  const candidates = [req.headers.get("x-cron-secret"), bearer];
  const ok = secret.length > 0 && candidates.some((c) => c !== null && c !== undefined && safeEqual(c, secret));
  if (!ok) throw new AppError("UNAUTHORIZED", "Invalid or missing cron secret", 401);
}
