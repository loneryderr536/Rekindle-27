const KEY = "activeHold";

/** Remembers the access token of the guest's current hold so a reload can resume (or release) it. */
export function saveHoldToken(accessToken: string): void {
  try {
    localStorage.setItem(KEY, accessToken);
  } catch {
    // Storage unavailable: a reload then loses the hold, which expires on its own.
  }
}

export function readHoldToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearHoldToken(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
