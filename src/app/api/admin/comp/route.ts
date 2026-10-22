import { jsonError } from "@/lib/errors";
import { CompInput, issueComp } from "@/server/admin/seats";
import { requireRole } from "@/server/auth/guard";
import { kickOutbox } from "@/server/email/kickOutbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const session = await requireRole(req, ["admin"]);
    const body = CompInput.parse(await req.json().catch(() => null));
    const result = await issueComp(body, session.adminUserId);
    kickOutbox();
    return Response.json(result);
  } catch (e) {
    return jsonError(e);
  }
}
