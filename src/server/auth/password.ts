import { hash, verify } from "@node-rs/argon2";

// @node-rs/argon2 defaults to Argon2id.

export function hashPassword(p: string): Promise<string> {
  return hash(p);
}

/** Never throws: a malformed hash or any verify error counts as a mismatch. */
export async function verifyPassword(hashed: string, p: string): Promise<boolean> {
  try {
    return await verify(hashed, p);
  } catch {
    return false;
  }
}
