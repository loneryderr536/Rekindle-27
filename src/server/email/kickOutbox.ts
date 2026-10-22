import { after } from "next/server";
import { processOutbox } from "@/server/email/outbox";

const inFlight = new Set<Promise<void>>();

function run(): Promise<void> {
  return processOutbox(5).then(
    () => undefined,
    (e) => console.error(`kickOutbox: ${e instanceof Error ? e.message : String(e)}`),
  );
}

/**
 * Sends pending emails right after the response so they do not wait for the cron. `after` keeps the
 * serverless function alive until the work finishes; outside a request scope (tests, scripts) it
 * throws, so fall back to a detached promise. Never throws.
 */
export function kickOutbox(): void {
  try {
    after(run);
  } catch {
    const p = run().finally(() => inFlight.delete(p));
    inFlight.add(p);
  }
}

/** Test helper: waits for outbox runs started by the detached fallback, so none outlive a test. */
export async function settleKickedOutbox(): Promise<void> {
  await Promise.all([...inFlight]);
}
