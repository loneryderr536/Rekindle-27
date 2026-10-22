import { jsonError } from "@/lib/errors";
import { releaseExpiredHolds } from "@/server/jobs/cleanup";
import { assertCron } from "@/server/security/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function run(req: Request): Promise<Response> {
  try {
    assertCron(req);
    return Response.json(await releaseExpiredHolds());
  } catch (e) {
    return jsonError(e);
  }
}

// Vercel Cron issues GET; POST is for external schedulers.
export const GET = run;
export const POST = run;
