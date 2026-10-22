"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function AdminLoginForm({ denied }: { denied: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(denied ? "Your account can't open that page." : null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      if (res.ok) {
        const { role } = (await res.json()) as { role: "admin" | "scanner" };
        router.push(role === "admin" ? "/admin" : "/scan");
        return;
      }
      setError(
        res.status === 429
          ? "Too many attempts. Please wait a few minutes and try again."
          : res.status === 401
            ? "Invalid email or password"
            : "Something went wrong. Please try again.",
      );
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="field">
        <span>Email</span>
        <input name="email" type="email" required autoComplete="username" inputMode="email" />
      </label>
      <label className="field">
        <span>Password</span>
        <input name="password" type="password" required autoComplete="current-password" />
      </label>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
