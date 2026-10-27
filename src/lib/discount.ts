/** Canonical form of a typed code, so "rekindle 10", "Rekindle-10" and "REKINDLE10" are the same code. */
export function normalizeDiscountCode(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/** Amount taken off `subtotalPaise` by a percentage discount, rounded to the nearest paisa. */
export function discountAmountPaise(subtotalPaise: number, percent: number): number {
  return Math.round((subtotalPaise * percent) / 100);
}
