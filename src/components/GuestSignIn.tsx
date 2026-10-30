"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { loadTurnstile } from "@/lib/turnstile";
import type { EmailCheck } from "@/server/guestAuth/checkEmail";

/** What went wrong with a Supabase call, so the form can show the right copy. */
export type AuthFailure = { kind: "invalid" | "rate_limited" | "unavailable"; message: string };
export type AuthResult = { error: null } | { error: AuthFailure };

export type GuestAuthClient = {
  sendCode(email: string, captchaToken: string): Promise<AuthResult>;
  verifyCode(email: string, code: string): Promise<AuthResult>;
  google(next: string): Promise<{ error: string | null }>;
};

export type CheckEmailFn = (email: string, opts?: { ignoreTypo?: boolean }) => Promise<EmailCheck>;

const RESEND_SECONDS = 60;
/** With the dev/test site key no widget is rendered; the server's test secret accepts this token. */
const TEST_TOKEN = "test-pass";

const COPY = {
  trouble: "Sign-in is having trouble. Try again shortly.",
  rateLimited: "Too many attempts. Wait a few minutes and try again.",
  wrongCode: "That code didn't work. Check it or send a new one.",
  noMailServer: "That email domain can't receive mail. Check the spelling.",
  disposable: "Please use your own email, not a temporary one.",
  format: "Enter a valid email address.",
  google: "Google sign-in didn't finish. Try again or use an email code.",
  captcha: "The security check didn't load. Refresh the page and try again.",
};

class CheckEmailFailure extends Error {
  constructor(readonly rateLimited: boolean) {
    super(rateLimited ? "rate limited" : "check failed");
  }
}

/** POSTs to /api/auth/check-email; never imports server code at runtime. */
const defaultCheckEmail: CheckEmailFn = async (email, opts) => {
  let res: Response;
  try {
    res = await fetch("/api/auth/check-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, ignoreTypo: opts?.ignoreTypo }),
    });
  } catch {
    throw new CheckEmailFailure(false);
  }
  if (res.status === 429) throw new CheckEmailFailure(true);
  if (res.status !== 200) throw new CheckEmailFailure(false);
  return (await res.json()) as EmailCheck;
};

/** Network failures and 5xx are `unavailable` (status 0 or missing), 429 is `rate_limited`, anything else `invalid`. */
export function toResult(error: { message: string; status?: number } | null): AuthResult {
  if (!error) return { error: null };
  const status = error.status;
  const kind = !status || status >= 500 ? "unavailable" : status === 429 ? "rate_limited" : "invalid";
  return { error: { kind, message: error.message } };
}

const defaultClient: GuestAuthClient = {
  async sendCode(email, captchaToken) {
    const { error } = await createSupabaseBrowser().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, captchaToken },
    });
    return toResult(error);
  },
  async verifyCode(email, code) {
    const { error } = await createSupabaseBrowser().auth.verifyOtp({ email, token: code, type: "email" });
    return toResult(error);
  },
  async google(next) {
    const { error } = await createSupabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    return { error: error?.message ?? null };
  },
};

type Props = { next: string; client?: GuestAuthClient; checkEmail?: CheckEmailFn };

/** Guest sign-in: Google, or a 6-digit code emailed to the guest (email → check → code). */
export function GuestSignIn({ next, client = defaultClient, checkEmail = defaultCheckEmail }: Props) {
  const router = useRouter();
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  const testMode = siteKey === "test";

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typo, setTypo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [token, setToken] = useState<string>(testMode ? TEST_TOKEN : "");
  const [widgetError, setWidgetError] = useState(siteKey === "");
  const widgetEl = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (testMode || !siteKey || !widgetEl.current) return;
    let cancelled = false;
    const el = widgetEl.current;
    loadTurnstile()
      .then((ts) => {
        if (cancelled) return;
        widgetId.current = ts.render(el, {
          sitekey: siteKey,
          callback: (t: string) => setToken(t),
          "expired-callback": () => setToken(""),
          "error-callback": () => setToken(""),
        });
      })
      .catch(() => !cancelled && setWidgetError(true));
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, testMode]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  /** Sends the code; Turnstile tokens are single-use, so a fresh one is needed for any resend. */
  async function send(to: string): Promise<boolean> {
    const { error: sendError } = await client.sendCode(to, token);
    if (!testMode) {
      setToken("");
      if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
    }
    if (sendError) {
      setError(sendError.kind === "rate_limited" ? COPY.rateLimited : COPY.trouble);
      return false;
    }
    setSentTo(to);
    setCode("");
    setStep("code");
    setResendIn(RESEND_SECONDS);
    return true;
  }

  async function checkAndSend(raw: string, ignoreTypo: boolean) {
    setBusy(true);
    setError(null);
    setTypo(null);
    try {
      const result = await checkEmail(raw.trim().toLowerCase(), ignoreTypo ? { ignoreTypo: true } : undefined);
      if (!result.ok) {
        if (result.reason === "typo" && result.suggestion) setTypo(result.suggestion);
        else setError(result.reason === "no_mail_server" ? COPY.noMailServer : result.reason === "disposable" ? COPY.disposable : COPY.format);
        return;
      }
      await send(result.email);
    } catch (e) {
      setError(e instanceof CheckEmailFailure && e.rateLimited ? COPY.rateLimited : COPY.trouble);
    } finally {
      setBusy(false);
    }
  }

  function onEmailSubmit(e: FormEvent) {
    e.preventDefault();
    if (!busy) void checkAndSend(email, false);
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: verifyError } = await client.verifyCode(sentTo, code.trim());
      if (verifyError) {
        setError(verifyError.kind === "invalid" ? COPY.wrongCode : verifyError.kind === "rate_limited" ? COPY.rateLimited : COPY.trouble);
        setBusy(false);
        return;
      }
      // Stay busy on success so a second submit cannot run while the navigation happens.
      router.replace(next);
      router.refresh();
    } catch {
      setError(COPY.trouble);
      setBusy(false);
    }
  }

  async function onResend() {
    setBusy(true);
    setError(null);
    try {
      await send(sentTo);
    } catch {
      setError(COPY.trouble);
    } finally {
      setBusy(false);
    }
  }

  function onChangeEmail() {
    setStep("email");
    setCode("");
    setError(null);
    setTypo(null);
  }

  async function onGoogle() {
    setError(null);
    try {
      const { error: googleError } = await client.google(next);
      if (googleError) setError(COPY.google);
    } catch {
      setError(COPY.google);
    }
  }

  return (
    <div className="space-y-5">
      <button type="button" className="btn-ghost w-full" onClick={onGoogle}>
        Continue with Google
      </button>
      <p className="m-0 text-center text-sm text-muted" aria-hidden="true">or</p>

      {/* One widget for both steps (hidden on the code step) so Send again can fetch a fresh token. */}
      {!testMode && <div ref={widgetEl} data-testid="turnstile-widget" hidden={step === "code" && !!token} className="min-h-[65px]" />}
      {widgetError && (
        <p role="alert" className="text-sm text-danger">
          {COPY.captcha}
        </p>
      )}

      {step === "email" ? (
        <form onSubmit={onEmailSubmit} className="space-y-5">
          <label className="field">
            <span>Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setTypo(null);
              }}
            />
          </label>
          {typo && (
            <div className="space-y-2">
              <button
                type="button"
                className="btn-ghost w-full"
                onClick={() => {
                  setEmail(typo);
                  setTypo(null);
                }}
              >
                Did you mean {typo}?
              </button>
              <button type="button" className="btn-ghost w-full" disabled={busy || (!testMode && !token)} onClick={() => void checkAndSend(email, true)}>
                Use {email.trim().toLowerCase()} anyway
              </button>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary w-full" disabled={busy || (!testMode && !token)}>
            Email me a code
          </button>
        </form>
      ) : (
        <form onSubmit={onVerify} className="space-y-5">
          <label className="field">
            <span>6-digit code</span>
            <input
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          <p className="m-0 text-sm text-muted">We sent it to {sentTo}.</p>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            Verify and continue
          </button>
          <button
            type="button"
            className="btn-ghost w-full"
            disabled={busy || resendIn > 0 || (!testMode && !token)}
            onClick={() => void onResend()}
          >
            {resendIn > 0 ? `Send again in ${resendIn}s` : "Send again"}
          </button>
          <button type="button" className="btn-ghost w-full" disabled={busy} onClick={onChangeEmail}>
            Use a different email
          </button>
          <p className="m-0 text-sm text-muted">Can&apos;t find it? Check spam, or continue with Google.</p>
        </form>
      )}
    </div>
  );
}
