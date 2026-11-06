import { jsonError } from "@/lib/errors";
import { getDefaultTier } from "@/server/seats/defaultTier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The flat per-seat price shown on /register/seats before a hold is created. */
export async function GET(): Promise<Response> {
  try {
    const tier = await getDefaultTier();
    return Response.json({ pricePaise: tier.pricePaise }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return jsonError(e);
  }
}
