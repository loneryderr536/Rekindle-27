import { z } from "zod";
import { AppError, jsonError } from "@/lib/errors";
import { findDiscount } from "@/server/discounts/findDiscount";
import { clientIp } from "@/server/security/clientIp";
import { rateLimit } from "@/server/security/rateLimit";

// Tight enough that codes can't be guessed by brute force, loose enough for a shared office or college IP.
const LIMIT = 30;
const WINDOW_SECONDS = 600;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ code: z.string().trim().min(1).max(40) });

export async function POST(req: Request): Promise<Response> {
  try {
    const rl = await rateLimit(`discount:ip:${clientIp(req)}`, LIMIT, WINDOW_SECONDS);
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
    const { code } = Body.parse(raw);
    return Response.json(await findDiscount(code));
  } catch (e) {
    return jsonError(e);
  }
}
