import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { env } from "@/lib/env";
import { AppError, jsonError } from "@/lib/errors";
import { FAKE_GUEST_COOKIE, signFakeGuest } from "@/server/guestAuth/fakeGuest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Input = z.object({ email: z.string().trim().min(3).max(254), name: z.string().trim().max(120).optional() });

/** A stable uuid-shaped id for an email: 32 hex chars of its sha256, as 8-4-4-4-12. */
function userIdFor(email: string): string {
  const h = createHash("sha256").update(email).digest("hex").slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** E2E only: signs the caller in as a fake guest. 404 unless GUEST_AUTH=fake. */
export async function POST(req: Request): Promise<Response> {
  try {
    if (env.GUEST_AUTH !== "fake") throw new AppError("NOT_FOUND", "Not found", 404);
    const raw: unknown = await req.json().catch(() => {
      throw new AppError("VALIDATION", "Request body must be valid JSON", 400);
    });
    const input = Input.parse(raw);
    const email = input.email.toLowerCase();
    const value = signFakeGuest({ userId: userIdFor(email), email, name: input.name || null });
    (await cookies()).set(FAKE_GUEST_COOKIE, value, { httpOnly: true, sameSite: "lax", path: "/" });
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
