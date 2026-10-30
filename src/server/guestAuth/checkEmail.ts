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

/** Real providers that sit close to a typo target; never flagged as typos. */
const KNOWN_PROVIDERS = new Set([
  ...COMMON_DOMAINS,
  "ymail.com",
  "mail.com",
  "email.com",
  "yahoo.co.uk",
  "yahoo.in",
  "outlook.in",
  "hotmail.co.uk",
  "live.com",
  "msn.com",
  "aol.com",
  "gmx.com",
  "protonmail.com",
  "proton.me",
  "zoho.com",
]);

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

const emailSchema = z.email();

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

export const DNS_TIMEOUT_MS = 2500;

type Lookup = "found" | "miss" | "unknown";

/** "miss" only when the lookup definitively says the name has no such records. */
async function lookup(fn: () => Promise<unknown[]>): Promise<Lookup> {
  try {
    return (await fn()).length > 0 ? "found" : "miss";
  } catch (e) {
    const code = (e as { code?: unknown } | null)?.code;
    return code === "ENOTFOUND" || code === "ENODATA" ? "miss" : "unknown";
  }
}

async function hasMailServer(domain: string, r: MailResolver): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Lookup[]>((resolve) => {
    timer = setTimeout(() => resolve(["unknown"]), DNS_TIMEOUT_MS); // fail open
  });
  try {
    const results = await Promise.race([
      Promise.all([lookup(() => r.resolveMx(domain)), lookup(() => r.resolve4(domain))]),
      timeout,
    ]);
    return !results.every((x) => x === "miss");
  } finally {
    clearTimeout(timer);
  }
}

export async function checkEmail(
  email: string,
  resolver?: MailResolver,
  opts: { ignoreTypo?: boolean } = {},
): Promise<EmailCheck> {
  const trimmed = email.trim();
  if (!emailSchema.safeParse(trimmed).success) return { ok: false, reason: "format" };
  const normalized = trimmed.toLowerCase();
  const at = normalized.lastIndexOf("@");
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);

  if (!opts.ignoreTypo && !KNOWN_PROVIDERS.has(domain)) {
    const near = COMMON_DOMAINS.find((d) => levenshtein(domain, d) <= 2);
    if (near) return { ok: false, reason: "typo", suggestion: `${local}@${near}` };
  }
  if (DISPOSABLE_DOMAINS.has(domain)) return { ok: false, reason: "disposable" };
  if (!(await hasMailServer(domain, resolver ?? testResolver ?? dns))) {
    return { ok: false, reason: "no_mail_server" };
  }
  return { ok: true, email: normalized };
}
