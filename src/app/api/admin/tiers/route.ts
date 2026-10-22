import { z } from "zod";
import { jsonError } from "@/lib/errors";
import { createTier, TierCreate, TierUpdate, updateTier } from "@/server/admin/tiers";
import { requireRole } from "@/server/auth/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Patch = z.object({ id: z.uuid() }).and(TierUpdate);

export async function POST(req: Request): Promise<Response> {
  try {
    const session = await requireRole(req, ["admin"]);
    const body = TierCreate.parse(await req.json().catch(() => null));
    return Response.json(await createTier(body, session.adminUserId), { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: Request): Promise<Response> {
  try {
    const session = await requireRole(req, ["admin"]);
    const { id, ...fields } = Patch.parse(await req.json().catch(() => null));
    return Response.json(await updateTier(id, fields, session.adminUserId));
  } catch (e) {
    return jsonError(e);
  }
}
