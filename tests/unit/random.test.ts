import { expect, test } from "vitest";
import { publicCode, randomToken } from "@/lib/random";

test("randomToken is 43 chars base64url", () => expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/));
test("randomToken honours byte length", () => expect(randomToken(16)).toMatch(/^[A-Za-z0-9_-]{22}$/));
test("randomToken values differ", () => expect(randomToken()).not.toBe(randomToken()));
test("publicCode excludes ambiguous chars", () => {
  for (let i = 0; i < 200; i++) expect(publicCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
});
