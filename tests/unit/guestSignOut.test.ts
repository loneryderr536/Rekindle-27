// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { readHoldToken, saveHoldToken } from "@/lib/activeHold";
import { readAttendeeRaw, saveAttendee } from "@/lib/attendee";
import { guestSignOut } from "@/lib/guestSignOut";

afterEach(() => vi.unstubAllGlobals());

test("sign-out clears the attendee and the hold token so the next account does not resume them", async () => {
  saveAttendee({ name: "Asha", email: "asha@example.com", phone: "9999999999", participants: 2 });
  saveHoldToken("hold-token-1");
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  await guestSignOut();

  expect(fetchMock).toHaveBeenCalledWith("/api/auth/sign-out", expect.objectContaining({ method: "POST" }));
  expect(readAttendeeRaw()).toBeNull();
  expect(readHoldToken()).toBeNull();
});
