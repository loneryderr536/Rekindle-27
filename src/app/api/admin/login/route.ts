import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { adminUsers } from "@/db/schema";
import { AppError, jsonError } from "@/lib/errors";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createSession, sessionCookie } from "@/server/auth/session";
import { clientIp } from "@/server/security/clientIp";
import { rateLimit } from "@/server/security/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_SECONDS = 15 * 60;
const EMAIL_LIMIT = 5;
const IP_LIMIT = 20;

const LoginInput = z.object({
  email: z.string().trim().toLowerCase().min(1).max(320),
  password: z.string().min(1).max(1024),
});

// Verified against when the email is unknown, so timing does not reveal which emails exist.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword("dummy-password-for-timing-equalisation"));

export async function POST(req: Request): Promise<Response> {
  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      throw new AppError("VALIDATION", "Request body must be valid JSON", 400);
    }
    const { email, password } = LoginInput.parse(raw);

    const byEmail = await rateLimit(`login:email:${email}`, EMAIL_LIMIT, WINDOW_SECONDS);
    const byIp = await rateLimit(`login:ip:${clientIp(req)}`, IP_LIMIT, WINDOW_SECONDS);
    if (!byEmail.ok || !byIp.ok) {
      const res = jsonError(new AppError("RATE_LIMITED", "Too many attempts, please try again later", 429));
      res.headers.set("Retry-After", String(Math.max(byEmail.retryAfter, byIp.retryAfter)));
      return res;
    }

    const [user] = await db.select().from(adminUsers).where(eq(adminUsers.email, email));
    const ok = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), password);
    if (!user || !ok) throw new AppError("INVALID_CREDENTIALS", "Invalid email or password", 401);

    const token = await createSession(user.id);
    const res = Response.json({ role: user.role });
    res.headers.set("Set-Cookie", sessionCookie(token));
    return res;
  } catch (e) {
    return jsonError(e);
  }
}
