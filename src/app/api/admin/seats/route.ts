import { z } from "zod";
import { jsonError } from "@/lib/errors";
import { blockSeats, BulkSeatIds, unblockSeats } from "@/server/admin/seats";
import { assignSeatsToTier } from "@/server/admin/tiers";
import { requireRole } from "@/server/auth/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("block"), seatIds: BulkSeatIds }),
  z.object({ action: z.literal("unblock"), seatIds: BulkSeatIds }),
  z.object({ action: z.literal("assignTier"), seatIds: BulkSeatIds, tierId: z.uuid() }),
]);

export async function POST(req: Request): Promise<Response> {
  try {
    const session = await requireRole(req, ["admin"]);
    const body = Body.parse(await req.json().catch(() => null));
    switch (body.action) {
      case "block":
        return Response.json(await blockSeats(body.seatIds, session.adminUserId));
      case "unblock":
        return Response.json(await unblockSeats(body.seatIds, session.adminUserId));
      case "assignTier":
        return Response.json(await assignSeatsToTier(body.seatIds, body.tierId, session.adminUserId));
    }
  } catch (e) {
    return jsonError(e);
  }
}
