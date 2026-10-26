import { z } from "zod";
import { env } from "@/lib/env";
import { AppError, jsonError } from "@/lib/errors";
import { cancelHold, getActiveHold } from "@/server/holds/activeHold";
import { readJson } from "@/server/scan/readJson";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The access token goes in the body, not the URL, so it stays out of access logs.
const Input = z.object({ accessToken: z.string().min(1).max(100) });

/** Resumes a hold after a reload: returns what the page needs to reopen Checkout, or 404 NO_ACTIVE_HOLD. */
export async function POST(req: Request): Promise<Response> {
  try {
    const { accessToken } = Input.parse(await readJson(req));
    const hold = await getActiveHold(accessToken);
    if (!hold) throw new AppError("NO_ACTIVE_HOLD", "No active hold", 404);
    return Response.json({
      ...hold,
      holdExpiresAt: hold.holdExpiresAt.toISOString(),
      razorpayKeyId: env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    });
  } catch (e) {
    return jsonError(e);
  }
}

/** Gives the held seats back. Idempotent: `released` is false when there was nothing pending. */
export async function DELETE(req: Request): Promise<Response> {
  try {
    const { accessToken } = Input.parse(await readJson(req));
    return Response.json({ released: await cancelHold(accessToken) });
  } catch (e) {
    return jsonError(e);
  }
}
