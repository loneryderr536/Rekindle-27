import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { AppError, jsonError } from "@/lib/errors";
import { clientIp } from "@/server/security/clientIp";
import { rateLimit } from "@/server/security/rateLimit";

// Code + email is unguessable; the limit only slows scripted probing, so leave room for shared IPs.
const LIMIT = 20;
const WINDOW_SECONDS = 600;

const LookupInput = z.object({
  publicCode: z.string().trim().min(1).max(64),
  email: z.string().trim().min(1).max(320),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const rl = await rateLimit(`lookup:ip:${clientIp(req)}`, LIMIT, WINDOW_SECONDS);
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
    const input = LookupInput.parse(raw);
    const { rows } = await db.execute<{ access_token: string }>(sql`
      SELECT access_token FROM bookings
       WHERE public_code = upper(${input.publicCode}) AND lower(trim(email)) = lower(${input.email})`);
    if (!rows[0]) throw new AppError("NOT_FOUND", "No booking found for that code and email", 404);
    return Response.json({ accessToken: rows[0].access_token });
  } catch (e) {
    return jsonError(e);
  }
}
