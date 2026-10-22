/**
 * Creates (or resets) a staff account.
 *
 * Usage: npm run admin:create -- <email> <admin|scanner> [--reset-password]
 *
 * Prompts for the password twice with no echo (minimum 12 characters). An existing email is
 * refused unless --reset-password is given, which replaces the hash and signs that user out.
 */
import { Writable } from "node:stream";
import { createInterface } from "node:readline";
import { config } from "dotenv";

const MIN_LENGTH = 12;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** One readline for the whole session (piped stdin would be lost between interfaces). */
function createPrompter() {
  let muted = false;
  const out = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output: out, terminal: process.stdin.isTTY });
  const lines: string[] = [];
  const waiters: ((line: string | null) => void)[] = [];
  let closed = false;
  rl.on("line", (line) => (waiters.shift() ?? ((l) => lines.push(l as string)))(line));
  rl.on("close", () => {
    closed = true;
    for (const w of waiters.splice(0)) w(null);
  });
  return {
    async ask(question: string): Promise<string> {
      process.stdout.write(question);
      muted = true; // the prompt text is already written; hide what the user types
      const line = await new Promise<string | null>((resolve) => {
        const queued = lines.shift();
        if (queued !== undefined) resolve(queued);
        else if (closed) resolve(null);
        else waiters.push(resolve);
      });
      muted = false;
      process.stdout.write("\n");
      if (line === null) throw new Error("Input ended before a password was entered");
      return line;
    },
    close: () => rl.close(),
  };
}

async function main() {
  config({ path: [".env.local", ".env"], quiet: true });
  const args = process.argv.slice(2);
  const reset = args.includes("--reset-password");
  const [rawEmail, role, ...extra] = args.filter((a) => !a.startsWith("--"));
  const usage = "Usage: npm run admin:create -- <email> <admin|scanner> [--reset-password]";
  if (!rawEmail || !role || extra.length > 0) fail(usage);
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(`Invalid email: ${rawEmail}`);
  if (role !== "admin" && role !== "scanner") fail(`Role must be "admin" or "scanner", got "${role}"`);

  const { db, closeDb } = await import("../src/db/client");
  const { adminSessions, adminUsers } = await import("../src/db/schema");
  const { hashPassword } = await import("../src/server/auth/password");
  const { eq } = await import("drizzle-orm");
  try {
    const [existing] = await db.select().from(adminUsers).where(eq(adminUsers.email, email));
    if (existing && !reset) fail(`${email} already exists. Pass --reset-password to change its password.`);
    if (!existing && reset) fail(`${email} does not exist, so there is no password to reset.`);

    const prompter = createPrompter();
    const pw = await prompter.ask("Password: ");
    if (pw.length < MIN_LENGTH) fail(`Password must be at least ${MIN_LENGTH} characters.`);
    const again = await prompter.ask("Repeat password: ");
    prompter.close();
    if (pw !== again) fail("Passwords do not match.");

    const passwordHash = await hashPassword(pw);
    if (existing) {
      await db.transaction(async (tx) => {
        await tx.update(adminUsers).set({ passwordHash }).where(eq(adminUsers.id, existing.id));
        await tx.delete(adminSessions).where(eq(adminSessions.adminUserId, existing.id));
      });
      console.log(`Password reset for ${email}; existing sessions were signed out.`);
    } else {
      await db.insert(adminUsers).values({ email, role, passwordHash });
      console.log(`Created ${role} ${email}.`);
    }
  } finally {
    await closeDb();
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
