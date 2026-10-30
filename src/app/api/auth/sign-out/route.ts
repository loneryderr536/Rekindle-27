import { cookies } from "next/headers";
import { jsonError } from "@/lib/errors";
import { assertSameOrigin } from "@/server/auth/guard";
import { FAKE_GUEST_COOKIE } from "@/server/guestAuth/fakeGuest";
import { createSupabaseServer } from "@/server/guestAuth/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
    (await cookies()).delete(FAKE_GUEST_COOKIE);
    const supabase = await createSupabaseServer();
    await supabase.auth.signOut();
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
