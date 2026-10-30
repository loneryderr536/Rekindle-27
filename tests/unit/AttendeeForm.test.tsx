// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
const guestSignOut = vi.fn();
vi.mock("@/lib/guestSignOut", () => ({ guestSignOut: () => guestSignOut() }));

import { AttendeeForm } from "@/components/AttendeeForm";

beforeEach(() => {
  sessionStorage.clear();
  push.mockReset();
  refresh.mockReset();
  guestSignOut.mockReset();
});

test("email is the verified one and read-only", () => {
  render(<AttendeeForm email="asha@example.com" suggestedName={null} />);
  const email = screen.getByLabelText(/^Email/) as HTMLInputElement;
  expect(email.value).toBe("asha@example.com");
  expect(email.readOnly).toBe(true);
});

test("name is prefilled with the suggested name when nothing is stored", () => {
  render(<AttendeeForm email="asha@example.com" suggestedName="Asha Rao" />);
  expect((screen.getByLabelText("Full name") as HTMLInputElement).value).toBe("Asha Rao");
});

test("submit saves the attendee with the session email", async () => {
  sessionStorage.setItem("attendee", JSON.stringify({ name: "Old", email: "old@example.com", phone: "9876543210", participants: 2 }));
  render(<AttendeeForm email="asha@example.com" suggestedName="Asha Rao" />);
  await userEvent.click(screen.getByRole("button", { name: /^Choose/ }));
  expect(push).toHaveBeenCalledWith("/register/seats");
  expect(JSON.parse(sessionStorage.getItem("attendee")!)).toMatchObject({ name: "Old", email: "asha@example.com", participants: 2 });
});

test("Switch account signs out then refreshes", async () => {
  let finish!: () => void;
  guestSignOut.mockReturnValue(new Promise<void>((r) => (finish = r)));
  render(<AttendeeForm email="asha@example.com" suggestedName={null} />);
  const btn = screen.getByRole("button", { name: /Switch account/ }) as HTMLButtonElement;
  await userEvent.click(btn);
  expect(btn.disabled).toBe(true);
  finish();
  await waitFor(() => expect(refresh).toHaveBeenCalled());
});

test("Switch account failure shows an alert and does not refresh", async () => {
  guestSignOut.mockRejectedValue(new Error("x"));
  render(<AttendeeForm email="asha@example.com" suggestedName={null} />);
  await userEvent.click(screen.getByRole("button", { name: /Switch account/ }));
  expect((await screen.findByRole("alert")).textContent).toBe("Couldn't switch account. Try again.");
  expect(refresh).not.toHaveBeenCalled();
  expect((screen.getByRole("button", { name: /Switch account/ }) as HTMLButtonElement).disabled).toBe(false);
});
