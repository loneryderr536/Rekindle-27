// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { AttendeeForm } from "@/components/AttendeeForm";

beforeEach(() => {
  sessionStorage.clear();
  push.mockReset();
});

test("email, name and phone are plain editable inputs, nothing prefilled when nothing is stored", () => {
  render(<AttendeeForm />);
  expect((screen.getByLabelText("Full name") as HTMLInputElement).value).toBe("");
  const email = screen.getByLabelText(/^Email/) as HTMLInputElement;
  expect(email.readOnly).toBe(false);
  expect(email.value).toBe("");
  expect((screen.getByLabelText(/^Mobile number/) as HTMLInputElement).value).toBe("");
});

test("previously stored details are prefilled", () => {
  sessionStorage.setItem("attendee", JSON.stringify({ name: "Asha Rao", email: "asha@example.com", phone: "9876543210", participants: 2 }));
  render(<AttendeeForm />);
  expect((screen.getByLabelText("Full name") as HTMLInputElement).value).toBe("Asha Rao");
  expect((screen.getByLabelText(/^Email/) as HTMLInputElement).value).toBe("asha@example.com");
  expect((screen.getByLabelText(/^Mobile number/) as HTMLInputElement).value).toBe("9876543210");
});

test("submit saves the typed details and goes to /register/seats", async () => {
  render(<AttendeeForm />);
  await userEvent.type(screen.getByLabelText("Full name"), "Asha Rao");
  await userEvent.type(screen.getByLabelText(/^Email/), "asha@example.com");
  await userEvent.type(screen.getByLabelText(/^Mobile number/), "9876543210");
  await userEvent.click(screen.getByRole("button", { name: /^Continue to payment/ }));
  expect(push).toHaveBeenCalledWith("/register/seats");
  expect(JSON.parse(sessionStorage.getItem("attendee")!)).toMatchObject({
    name: "Asha Rao", email: "asha@example.com", phone: "9876543210", participants: 1,
  });
});

test("an invalid phone number blocks submission", async () => {
  render(<AttendeeForm />);
  await userEvent.type(screen.getByLabelText("Full name"), "Asha Rao");
  await userEvent.type(screen.getByLabelText(/^Email/), "asha@example.com");
  await userEvent.type(screen.getByLabelText(/^Mobile number/), "12345");
  await userEvent.click(screen.getByRole("button", { name: /^Continue to payment/ }));
  expect(push).not.toHaveBeenCalled();
  expect(sessionStorage.getItem("attendee")).toBeNull();
  expect(screen.getByText("Enter a 10-digit Indian mobile number.")).toBeTruthy();
});
