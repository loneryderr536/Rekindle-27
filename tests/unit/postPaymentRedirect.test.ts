import { expect, test, vi } from "vitest";
import { postPaymentRedirect } from "@/app/booking/[token]/postPaymentRedirect";

const guest = { userId: "u", email: "asha@example.com", name: null };
const booking = (status: "paid" | "pending" | "comp", email = " Asha@Example.com ") =>
  ({ email, status, publicCode: "AB12" }) as Parameters<typeof postPaymentRedirect>[0];

test("paid + owner redirects to My bookings", async () => {
  const load = vi.fn().mockResolvedValue(guest);
  expect(await postPaymentRedirect(booking("paid"), "1", load)).toBe("/my-bookings?new=AB12");
  expect(await postPaymentRedirect(booking("comp"), "1", load)).toBe("/my-bookings?new=AB12");
});

test("pending + owner does not redirect", async () => {
  const load = vi.fn().mockResolvedValue(guest);
  expect(await postPaymentRedirect(booking("pending"), "1", load)).toBeNull();
});

test("non-owner does not redirect", async () => {
  const load = vi.fn().mockResolvedValue({ ...guest, email: "other@example.com" });
  expect(await postPaymentRedirect(booking("paid"), "1", load)).toBeNull();
  expect(await postPaymentRedirect(booking("paid"), "1", vi.fn().mockResolvedValue(null))).toBeNull();
});

test("without paid=1 there is no redirect and getGuest is not called", async () => {
  const load = vi.fn().mockResolvedValue(guest);
  expect(await postPaymentRedirect(booking("paid"), undefined, load)).toBeNull();
  expect(await postPaymentRedirect(booking("paid"), "0", load)).toBeNull();
  expect(load).not.toHaveBeenCalled();
});
