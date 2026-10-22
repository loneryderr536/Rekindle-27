import { randomBytes, randomInt } from "node:crypto";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Cryptographically random URL-safe token (base64url). 32 bytes -> 43 chars. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** 6-character human-friendly booking code (no 0/O/1/I). */
export function publicCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}
