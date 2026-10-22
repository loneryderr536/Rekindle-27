import { z } from "zod";
import { env } from "@/lib/env";
import { AppError, jsonError } from "@/lib/errors";
import { getFakeGateway } from "@/server/payments/fakeGateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Input = z.object({ orderId: z.string().min(1), paymentId: z.string().min(1) });

/** E2E only: reports a payment as captured on the fake gateway. 404 unless PAYMENT_GATEWAY=fake. */
export async function POST(req: Request): Promise<Response> {
  try {
    if (env.PAYMENT_GATEWAY !== "fake") throw new AppError("NOT_FOUND", "Not found", 404);
    const raw: unknown = await req.json().catch(() => {
      throw new AppError("VALIDATION", "Request body must be valid JSON", 400);
    });
    const { orderId, paymentId } = Input.parse(raw);
    getFakeGateway().capture(orderId, paymentId);
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
