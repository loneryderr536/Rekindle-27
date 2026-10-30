import dns from "node:dns/promises";
import { z } from "zod";

export type EmailCheck =
  | { ok: true; email: string }
  | { ok: false; reason: "format" | "no_mail_server" | "disposable" | "typo"; suggestion?: string };

export type MailResolver = {
  resolveMx(domain: string): Promise<unknown[]>;
  resolve4(domain: string): Promise<unknown[]>;
};

const COMMON_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "yahoo.co.in",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "rediffmail.com",
];

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "temp-mail.org",
  "yopmail.com",
  "trashmail.com",
  "sharklasers.com",
  "getnada.com",
  "dispostable.com",
  "maildrop.cc",
  "throwawaymail.com",
]);

const emailSchema = z.string().email();

let testResolver: MailResolver | null = null;
/** Test seam: replaces the DNS resolver. Pass null to restore the default. */
export function setMailResolverForTests(r: MailResolver | null): void {
  testResolver = r;
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** True only when the lookup definitively says the name has no such records. */
function isDefiniteMiss(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  return code === "ENOTFOUND" || code === "ENODATA";
}

async function hasMailServer(domain: string, r: MailResolver): Promise<boolean> {
  try {
    if ((await r.resolveMx(domain)).length > 0) return true;
  } catch (e) {
    if (!isDefiniteMiss(e)) return true; // timeout / SERVFAIL: do not block the guest
  }
  try {
    if ((await r.resolve4(domain)).length > 0) return true;
  } catch (e) {
    if (!isDefiniteMiss(e)) return true;
  }
  return false;
}

export async function checkEmail(email: string, resolver?: MailResolver): Promise<EmailCheck> {
  const trimmed = email.trim();
  if (!emailSchema.safeParse(trimmed).success) return { ok: false, reason: "format" };
  const normalized = trimmed.toLowerCase();
  const at = normalized.lastIndexOf("@");
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);

  if (!COMMON_DOMAINS.includes(domain)) {
    const near = COMMON_DOMAINS.find((d) => levenshtein(domain, d) <= 2);
    if (near) return { ok: false, reason: "typo", suggestion: `${local}@${near}` };
  }
  if (DISPOSABLE_DOMAINS.has(domain)) return { ok: false, reason: "disposable" };
  if (!(await hasMailServer(domain, resolver ?? testResolver ?? dns))) {
    return { ok: false, reason: "no_mail_server" };
  }
  return { ok: true, email: normalized };
}
