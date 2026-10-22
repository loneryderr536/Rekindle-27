import { jsonError } from "@/lib/errors";
import { requireRole } from "@/server/auth/guard";
import { limitScans } from "@/server/scan/rateLimit";
import { scanTicket } from "@/server/scan/scanTicket";
import { ScanInput } from "@/server/scan/schemas";
import { readJson } from "@/server/scan/readJson";
import { parseQrPayload } from "@/server/tickets/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const session = await requireRole(req, ["admin", "scanner"]);
    await limitScans(session.adminUserId);
    const input = ScanInput.parse(await readJson(req));
    const token = parseQrPayload(input.payload);
    if (!token) return Response.json({ result: "invalid" });
    return Response.json(await scanTicket({ token, adminUserId: session.adminUserId, gate: input.gate }));
  } catch (e) {
    return jsonError(e);
  }
}
