import { jsonError } from "@/lib/errors";
import { reconcilePending } from "@/server/jobs/reconcile";
import { getGateway } from "@/server/payments/gateway";
import { assertCron } from "@/server/security/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function run(req: Request): Promise<Response> {
  try {
    assertCron(req);
    return Response.json(await reconcilePending(getGateway()));
  } catch (e) {
    return jsonError(e);
  }
}

// Vercel Cron issues GET; POST is for external schedulers.
export const GET = run;
export const POST = run;
