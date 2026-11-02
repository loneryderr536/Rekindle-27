import { z } from "zod";
import { jsonError } from "@/lib/errors";
import { logAudit } from "@/server/admin/audit";
import { requireRole } from "@/server/auth/guard";
import { importSeats, type VenueRow } from "@/server/seats/importSeats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DesignRow = z.object({
  section: z.string().trim().min(1).max(20),
  row: z.string().trim().min(1).max(20),
  number: z.number().int().positive(),
  x: z.number().finite(),
  y: z.number().finite(),
  tier: z.string().trim().min(1),
}) satisfies z.ZodType<VenueRow>;

const DesignInput = z.object({ rows: z.array(DesignRow).min(1).max(1000) });

/**
 * Saves a batch of seat placements from the drag-and-drop designer: new seats and position/tier
 * changes to existing ones, by the same label-upsert rules as `npm run seed:seats` (existing seats
 * are only touched while `available`, so a layout change never displaces someone's held or sold seat).
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const session = await requireRole(req, ["admin"]);
    const { rows } = DesignInput.parse(await req.json().catch(() => null));
    const result = await importSeats(rows);
    await logAudit(session.adminUserId, "design_seats", { count: rows.length, inserted: result.inserted });
    return Response.json(result);
  } catch (e) {
    return jsonError(e);
  }
}
