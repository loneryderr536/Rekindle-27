import { db } from "@/db/client";
import { auditLog } from "@/db/schema";
import type { Tx } from "@/server/tickets/tokens";

/** Records an admin action. Pass `tx` to make the entry part of the caller's transaction. */
export async function logAudit(
  adminUserId: string,
  action: string,
  details: Record<string, unknown>,
  tx: Tx | typeof db = db,
): Promise<void> {
  await tx.insert(auditLog).values({ adminUserId, action, details });
}
