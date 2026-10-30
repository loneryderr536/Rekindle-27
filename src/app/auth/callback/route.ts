import { NextResponse } from "next/server";
import { safeNext } from "@/lib/safeNext";
import { createSupabaseServer } from "@/server/guestAuth/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Google OAuth return: swaps the code for a session cookie, then goes on to `next`. */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  if (code) {
    try {
      const supabase = await createSupabaseServer();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, url.origin));
    } catch (e) {
      console.error("auth callback failed", e);
    }
  }
  return NextResponse.redirect(new URL(`/sign-in?error=google&next=${encodeURIComponent(next)}`, url.origin));
}
