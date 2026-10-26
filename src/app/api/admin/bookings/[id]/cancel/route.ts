import { z } from "zod";
import { jsonError } from "@/lib/errors";
import { requireRole } from "@/server/auth/guard";
import { kickOutbox } from "@/server/email/kickOutbox";
import { cancelBooking } from "@/server/payments/cancelBooking";
import { getGateway } from "@/server/payments/gateway";
import { refundBooking } from "@/server/payments/refunds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Params = z.object({ id: z.uuid() });

export async function POST(req: Request, ctx: RouteContext<"/api/admin/bookings/[id]/cancel">): Promise<Response> {
  try {
    const session = await requireRole(req, ["admin"]);
    const { id } = Params.parse(await ctx.params);
    const status = await cancelBooking(id, session.adminUserId);
    // Refund now; if Razorpay is down the booking stays refund_due and the reconcile cron retries it.
    let refunded = false;
    if (status === "refund_due") {
      try {
        refunded = await refundBooking(getGateway(), id);
      } catch (e) {
        console.error(`cancel booking ${id}: refund deferred to reconcile: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (refunded || status === "cancelled") kickOutbox();
    return Response.json({ ok: true, status: refunded ? "refunded" : status });
  } catch (e) {
    return jsonError(e);
  }
}
