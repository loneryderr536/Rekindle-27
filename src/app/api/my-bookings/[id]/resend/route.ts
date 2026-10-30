import { z } from "zod";
import { AppError, jsonError } from "@/lib/errors";
import { assertSameOrigin } from "@/server/auth/guard";
import { resendForGuest } from "@/server/bookings/guestResend";
import { kickOutbox } from "@/server/email/kickOutbox";
import { getGuest } from "@/server/guestAuth/getGuest";
import { rateLimit } from "@/server/security/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Params = z.object({ id: z.uuid() });

export async function POST(req: Request, ctx: RouteContext<"/api/my-bookings/[id]/resend">): Promise<Response> {
  try {
    // Order: origin, guest, params, ownership + status, rate limit, queue, kick.
    assertSameOrigin(req);
    const guest = await getGuest();
    if (!guest) throw new AppError("SIGN_IN_REQUIRED", "Sign in to continue", 401);
    const { id } = Params.parse(await ctx.params);
    await resendForGuest(id, guest.email, async () => {
      const rl = await rateLimit(`resend:booking:${id}`, 3, 3600);
      if (!rl.ok) {
        throw new AppError("RATE_LIMITED", "Too many resend requests. Try again later.", 429, {
          retryAfter: rl.retryAfter,
        });
      }
    });
    kickOutbox();
    return Response.json({ ok: true });
  } catch (e) {
    const res = jsonError(e);
    if (e instanceof AppError && e.status === 429 && typeof e.details?.retryAfter === "number") {
      res.headers.set("Retry-After", String(e.details.retryAfter));
    }
    return res;
  }
}
