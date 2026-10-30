// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { GuestSignIn, type GuestAuthClient } from "@/components/GuestSignIn";
import type { EmailCheck } from "@/server/guestAuth/checkEmail";

const turnstile = vi.hoisted(() => ({ render: vi.fn(), reset: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/turnstile", () => ({ loadTurnstile: () => Promise.resolve(turnstile) }));

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

beforeEach(() => {
  replace.mockReset();
  refresh.mockReset();
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "test");
});

function fakeClient(over: Partial<GuestAuthClient> = {}): GuestAuthClient {
  return {
    sendCode: vi.fn().mockResolvedValue({ error: null }),
    verifyCode: vi.fn().mockResolvedValue({ error: null }),
    google: vi.fn().mockResolvedValue({ error: null }),
    ...over,
  };
}

const ok = (email: string): EmailCheck => ({ ok: true, email });
const emailInput = () => screen.getByLabelText("Email") as HTMLInputElement;

test("a typo suggestion is offered, nothing is sent, and clicking it fills the field", async () => {
  const client = fakeClient();
  const checkEmail = vi.fn().mockResolvedValue({ ok: false, reason: "typo", suggestion: "asha@gmail.com" });
  const user = userEvent.setup();
  render(<GuestSignIn next="/register" client={client} checkEmail={checkEmail} />);

  await user.type(emailInput(), "asha@gmial.com");
  await user.click(screen.getByRole("button", { name: "Email me a code" }));

  const suggest = await screen.findByRole("button", { name: "Did you mean asha@gmail.com?" });
  expect(client.sendCode).not.toHaveBeenCalled();
  await user.click(suggest);
  expect(emailInput().value).toBe("asha@gmail.com");
});

test("'Use … anyway' re-checks with ignoreTypo and sends the code", async () => {
  const client = fakeClient();
  const checkEmail = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, reason: "typo", suggestion: "asha@gmail.com" })
    .mockResolvedValueOnce(ok("asha@gmial.com"));
  const user = userEvent.setup();
  render(<GuestSignIn next="/register" client={client} checkEmail={checkEmail} />);

  await user.type(emailInput(), "asha@gmial.com");
  await user.click(screen.getByRole("button", { name: "Email me a code" }));
  await user.click(await screen.findByRole("button", { name: "Use asha@gmial.com anyway" }));

  expect(checkEmail).toHaveBeenLastCalledWith("asha@gmial.com", { ignoreTypo: true });
  await waitFor(() => expect(client.sendCode).toHaveBeenCalledWith("asha@gmial.com", "test-pass"));
  expect(await screen.findByLabelText("6-digit code")).toBeTruthy();
});

test("an ok check sends the trimmed lower-case email and shows the code step", async () => {
  const client = fakeClient();
  const checkEmail = vi.fn().mockImplementation(async (e: string) => ok(e.trim().toLowerCase()));
  const user = userEvent.setup();
  render(<GuestSignIn next="/register" client={client} checkEmail={checkEmail} />);

  await user.type(emailInput(), "  Asha@Example.COM ");
  await user.click(screen.getByRole("button", { name: "Email me a code" }));

  expect(await screen.findByLabelText("6-digit code")).toBeTruthy();
  expect(client.sendCode).toHaveBeenCalledWith("asha@example.com", "test-pass");
});

test("a wrong code shows the retry copy; a right code replaces to next and refreshes", async () => {
  const verifyCode = vi.fn().mockResolvedValueOnce({ error: "bad" }).mockResolvedValueOnce({ error: null });
  const client = fakeClient({ verifyCode });
  const user = userEvent.setup();
  render(<GuestSignIn next="/register" client={client} checkEmail={async (e) => ok(e)} />);

  await user.type(emailInput(), "asha@example.com");
  await user.click(screen.getByRole("button", { name: "Email me a code" }));
  await user.type(await screen.findByLabelText("6-digit code"), "123456");
  await user.click(screen.getByRole("button", { name: "Verify and continue" }));
  expect(await screen.findByText("That code didn't work. Check it or send a new one.")).toBeTruthy();
  expect(replace).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Verify and continue" }));
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/register"));
  expect(refresh).toHaveBeenCalled();
  expect((screen.getByRole("button", { name: "Verify and continue" }) as HTMLButtonElement).disabled).toBe(true);
});

test("Send again is disabled with a countdown right after sending", async () => {
  const user = userEvent.setup();
  render(<GuestSignIn next="/register" client={fakeClient()} checkEmail={async (e) => ok(e)} />);
  await user.type(emailInput(), "asha@example.com");
  await user.click(screen.getByRole("button", { name: "Email me a code" }));
  const again = (await screen.findByRole("button", { name: "Send again in 60s" })) as HTMLButtonElement;
  expect(again.disabled).toBe(true);
});

test("a Google error shows the Google copy", async () => {
  const client = fakeClient({ google: vi.fn().mockResolvedValue({ error: "oauth failed" }) });
  const user = userEvent.setup();
  render(<GuestSignIn next="/register" client={client} checkEmail={async (e) => ok(e)} />);
  await user.click(screen.getByRole("button", { name: "Continue with Google" }));
  expect(await screen.findByText("Google sign-in didn't finish. Try again or use an email code.")).toBeTruthy();
});

test("on the code step with no captcha token the widget is visible so Send again can be unlocked", async () => {
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site-key");
  turnstile.render.mockReset();
  window.turnstile = turnstile;
  turnstile.render.mockImplementation((_el: HTMLElement, opts: { callback: (t: string) => void }) => {
    opts.callback("tok-1");
    return "w1";
  });
  const user = userEvent.setup();
  render(<GuestSignIn next="/register" client={fakeClient()} checkEmail={async (e) => ok(e)} />);
  await user.type(emailInput(), "asha@example.com");
  await waitFor(() =>
    expect((screen.getByRole("button", { name: "Email me a code" }) as HTMLButtonElement).disabled).toBe(false),
  );
  await user.click(screen.getByRole("button", { name: "Email me a code" }));
  await screen.findByLabelText("6-digit code");
  expect(turnstile.reset).toHaveBeenCalled();
  expect(screen.getByTestId("turnstile-widget").hidden).toBe(false);
});
