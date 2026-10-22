import { jsonError } from "@/lib/errors";
import { processOutbox } from "@/server/email/outbox";
import { assertCron } from "@/server/security/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function run(req: Request): Promise<Response> {
  try {
    assertCron(req);
    return Response.json(await processOutbox(20));
  } catch (e) {
    return jsonError(e);
  }
}

// Vercel Cron issues GET; POST is for external schedulers.
export const GET = run;
export const POST = run;
