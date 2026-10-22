import { jsonError } from "@/lib/errors";
import { requireRole } from "@/server/auth/guard";
import { limitScans } from "@/server/scan/rateLimit";
import { readJson } from "@/server/scan/readJson";
import { checkInTicketById } from "@/server/scan/scanTicket";
import { CheckInInput } from "@/server/scan/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const session = await requireRole(req, ["admin", "scanner"]);
    await limitScans(session.adminUserId);
    const input = CheckInInput.parse(await readJson(req));
    return Response.json(await checkInTicketById(input.ticketId, session.adminUserId, input.gate));
  } catch (e) {
    return jsonError(e);
  }
}
