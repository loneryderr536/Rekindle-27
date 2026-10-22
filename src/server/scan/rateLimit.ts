import { AppError } from "@/lib/errors";
import { rateLimit } from "@/server/security/rateLimit";

/** 120 check-in actions per minute per staff user. */
export async function limitScans(adminUserId: string): Promise<void> {
  const rl = await rateLimit(`scan:user:${adminUserId}`, 120, 60);
  if (!rl.ok) {
    throw new AppError("RATE_LIMITED", "Too many scans, slow down for a moment", 429, { retryAfter: rl.retryAfter });
  }
}
