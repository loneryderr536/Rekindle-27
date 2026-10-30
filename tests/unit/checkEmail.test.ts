import { describe, expect, test, vi } from "vitest";
import { checkEmail, DNS_TIMEOUT_MS, type MailResolver } from "@/server/guestAuth/checkEmail";

const err = (code: string) => Object.assign(new Error(code), { code });
const resolver = (mx: () => Promise<unknown[]>, a: () => Promise<unknown[]>): MailResolver => ({
  resolveMx: mx,
  resolve4: a,
});
const withMx = resolver(async () => [{ exchange: "mx.example.com", priority: 10 }], async () => []);

describe("checkEmail", () => {
  test("rejects a malformed address", async () => {
    expect(await checkEmail("not-an-email", withMx)).toEqual({ ok: false, reason: "format" });
  });

  test("suggests a correction for a near-miss of a common domain", async () => {
    expect(await checkEmail("asha@gmial.com", withMx)).toEqual({
      ok: false,
      reason: "typo",
      suggestion: "asha@gmail.com",
    });
  });

  test("does not flag the common domain itself", async () => {
    expect(await checkEmail("asha@gmail.com", withMx)).toEqual({ ok: true, email: "asha@gmail.com" });
  });

  test("rejects disposable domains", async () => {
    expect(await checkEmail("x@mailinator.com", withMx)).toMatchObject({ ok: false, reason: "disposable" });
  });

  test("no MX and no A record is no_mail_server", async () => {
    const r = resolver(
      async () => Promise.reject(err("ENOTFOUND")),
      async () => Promise.reject(err("ENOTFOUND")),
    );
    expect(await checkEmail("a@nowhere-example.test", r)).toEqual({ ok: false, reason: "no_mail_server" });
  });

  test("ENODATA on both lookups is no_mail_server", async () => {
    const r = resolver(
      async () => Promise.reject(err("ENODATA")),
      async () => Promise.reject(err("ENODATA")),
    );
    expect(await checkEmail("a@nowhere-example.test", r)).toMatchObject({ reason: "no_mail_server" });
  });

  test("MX missing but A record present is ok", async () => {
    const r = resolver(
      async () => Promise.reject(err("ENODATA")),
      async () => ["93.184.216.34"],
    );
    expect(await checkEmail("a@example.org", r)).toEqual({ ok: true, email: "a@example.org" });
  });

  test("a DNS timeout does not block the guest", async () => {
    const r = resolver(
      async () => Promise.reject(err("ETIMEOUT")),
      async () => Promise.reject(err("ETIMEOUT")),
    );
    expect(await checkEmail("a@example.org", r)).toEqual({ ok: true, email: "a@example.org" });
  });

  test("SERVFAIL on one lookup with ENOTFOUND on the other does not block", async () => {
    const r = resolver(
      async () => Promise.reject(err("ESERVFAIL")),
      async () => Promise.reject(err("ENOTFOUND")),
    );
    expect(await checkEmail("a@example.org", r)).toMatchObject({ ok: true });
  });

  test("trims and lower-cases the address", async () => {
    expect(await checkEmail(" Asha@Example.com ", withMx)).toEqual({ ok: true, email: "asha@example.com" });
  });

  test.each(["ymail.com", "mail.com", "email.com", "yahoo.co.uk"])("known provider %s is not a typo", async (d) => {
    expect(await checkEmail(`a@${d}`, withMx)).toEqual({ ok: true, email: `a@${d}` });
  });

  test("ignoreTypo lets a typo-looking domain through", async () => {
    expect(await checkEmail("asha@gmial.com", withMx, { ignoreTypo: true })).toEqual({
      ok: true,
      email: "asha@gmial.com",
    });
  });

  test("ignoreTypo still rejects disposable domains", async () => {
    expect(await checkEmail("x@mailinator.com", withMx, { ignoreTypo: true })).toMatchObject({
      reason: "disposable",
    });
  });

  test("a resolver that never answers fails open after the timeout", async () => {
    vi.useFakeTimers();
    try {
      const never = resolver(() => new Promise(() => {}), () => new Promise(() => {}));
      const p = checkEmail("a@example.org", never);
      await vi.advanceTimersByTimeAsync(DNS_TIMEOUT_MS);
      expect(await p).toEqual({ ok: true, email: "a@example.org" });
    } finally {
      vi.useRealTimers();
    }
  });
});
