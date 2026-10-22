import { z } from "zod";
import { jsonError } from "@/lib/errors";
import { resendTickets } from "@/server/admin/bookings";
import { requireRole } from "@/server/auth/guard";
import { kickOutbox } from "@/server/email/kickOutbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Params = z.object({ id: z.uuid() });

export async function POST(req: Request, ctx: RouteContext<"/api/admin/bookings/[id]/resend">): Promise<Response> {
  try {
    const session = await requireRole(req, ["admin"]);
    const { id } = Params.parse(await ctx.params);
    await resendTickets(id, session.adminUserId);
    kickOutbox();
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
