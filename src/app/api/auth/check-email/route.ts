import { z } from "zod";
import { AppError, jsonError } from "@/lib/errors";
import { assertSameOrigin } from "@/server/auth/guard";
import { checkEmail } from "@/server/guestAuth/checkEmail";
import { clientIp } from "@/server/security/clientIp";
import { rateLimit } from "@/server/security/rateLimit";

const LIMIT = 20;
const WINDOW_SECONDS = 600;

const Input = z.object({ email: z.string().max(320), ignoreTypo: z.boolean().optional() });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
    const rl = await rateLimit(`checkemail:ip:${clientIp(req)}`, LIMIT, WINDOW_SECONDS);
    if (!rl.ok) {
      const res = jsonError(new AppError("RATE_LIMITED", "Too many requests, please try again later", 429));
      res.headers.set("Retry-After", String(rl.retryAfter));
      return res;
    }
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      throw new AppError("VALIDATION", "Request body must be valid JSON", 400);
    }
    const { email, ignoreTypo } = Input.parse(raw);
    return Response.json(await checkEmail(email, undefined, { ignoreTypo }));
  } catch (e) {
    return jsonError(e);
  }
}
