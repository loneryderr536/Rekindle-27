// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { MyBookingCard } from "@/components/MyBookingCard";
import type { GuestBooking } from "@/server/bookings/listGuestBookings";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh, replace: vi.fn() }) }));
const saveHoldToken = vi.fn();
vi.mock("@/lib/activeHold", () => ({ saveHoldToken: (t: string) => saveHoldToken(t) }));

function booking(over: Partial<GuestBooking> = {}): GuestBooking {
  return {
    id: "b1", publicCode: "ABC123", accessToken: "tok", status: "paid", amountPaise: 150000,
    holdExpiresAt: new Date("2026-11-01T10:00:00Z"), createdAt: new Date("2026-11-01T09:00:00Z"),
    seats: [{ label: "G-A-1", tierName: "Gold" }], ...over,
  };
}

beforeEach(() => {
  push.mockClear();
  refresh.mockClear();
  saveHoldToken.mockClear();
});

test("paid booking links to its tickets and offers a resend", () => {
  render(<MyBookingCard booking={booking()} highlight={false} />);
  expect(screen.getByRole("link", { name: "View tickets" }).getAttribute("href")).toBe("/booking/tok");
  expect(screen.getByRole("button", { name: "Resend ticket email" })).toBeTruthy();
});

test("active pending booking resumes its hold", async () => {
  render(<MyBookingCard booking={booking({ status: "pending" })} highlight={false} />);
  expect(screen.queryByRole("link", { name: "View tickets" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Finish paying" }));
  expect(saveHoldToken).toHaveBeenCalledWith("tok");
  expect(push).toHaveBeenCalledWith("/register/seats");
});

test("refunded booking shows its status and no actions", () => {
  render(<MyBookingCard booking={booking({ status: "refunded" })} highlight={false} />);
  expect(screen.getByText("Refunded")).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.queryByRole("link")).toBeNull();
});

test("highlight marks the card as current", () => {
  const { container } = render(<MyBookingCard booking={booking()} highlight />);
  expect(container.querySelector('[aria-current="true"]')).toBeTruthy();
  expect(screen.getByText("Just booked")).toBeTruthy();
});

test("resend shows the sent and rate-limit messages", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 200 })
    .mockResolvedValueOnce({ ok: false, status: 429 });
  vi.stubGlobal("fetch", fetchMock);
  render(<MyBookingCard booking={booking()} highlight={false} />);
  await userEvent.click(screen.getByRole("button", { name: "Resend ticket email" }));
  expect(await screen.findByText("Sent. Check your inbox.")).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledWith("/api/my-bookings/b1/resend", { method: "POST" });
  await userEvent.click(screen.getByRole("button", { name: "Resend ticket email" }));
  expect(await screen.findByText("Already resent recently. Try again in an hour.")).toBeTruthy();
  vi.unstubAllGlobals();
});
