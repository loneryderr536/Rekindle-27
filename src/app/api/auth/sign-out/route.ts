import { cookies } from "next/headers";
import { AppError, jsonError } from "@/lib/errors";
import { assertSameOrigin } from "@/server/auth/guard";
import { FAKE_GUEST_COOKIE } from "@/server/guestAuth/fakeGuest";
import { createSupabaseServer } from "@/server/guestAuth/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
    const store = await cookies();
    store.delete(FAKE_GUEST_COOKIE);
    const supabase = await createSupabaseServer();
    let { error } = await supabase.auth.signOut();
    if (error) ({ error } = await supabase.auth.signOut({ scope: "local" }));
    if (error) {
      // Supabase could not revoke the session; drop its cookies so this browser is signed out anyway.
      for (const { name } of store.getAll()) if (name.startsWith("sb-")) store.delete(name);
      throw new AppError("SIGN_OUT_FAILED", "Couldn't sign you out. Try again.", 502);
    }
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
