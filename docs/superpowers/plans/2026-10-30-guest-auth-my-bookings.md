# Guest Sign-in and My Bookings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guests sign in with Google or an email code (Supabase Auth) before booking, the booking email is the verified one, and `/my-bookings` lists every booking for that email.

**Architecture:** `@supabase/ssr` keeps the Supabase session in cookies. The browser only starts sign-in; server code gets identity solely from `getGuest()` (Supabase `getUser()`), which `POST /api/holds`, `/register`, `/my-bookings` and the resend route use. Data stays in Drizzle/Postgres; a `GUEST_AUTH=fake` mode (E2E only) swaps Supabase for a signed test cookie.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript, Drizzle + Postgres, `@supabase/ssr` + `@supabase/supabase-js`, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-30-guest-auth-my-bookings-design.md`

## Global Constraints

- Before writing Next.js code, read the relevant guide in `node_modules/next/dist/docs/` (AGENTS.md): at least `01-app/01-getting-started/16-proxy.md`, `01-app/02-guides/authentication.md`, and the `cookies`/route handler API references. Next 16 calls middleware `proxy`.
- **Never commit** anything under `docs/superpowers/` (the owner keeps the spec and this plan uncommitted). Commit steps list code paths only.
- Guest identity comes only from `getGuest()`. Never use `supabase.auth.getSession()` server-side and never trust a browser-sent email.
- Emails compared and stored as `trim().toLowerCase()`.
- Email code: 6 digits, expires in 600 s (Supabase setting), resend allowed after 60 s.
- Ticket resend: statuses `paid` or `comp` only; limit 3 per booking per 3600 s.
- `GUEST_AUTH=fake` is refused when `NODE_ENV=production` unless `ALLOW_TEST_MODES=1` and not on Vercel (same rule as `PAYMENT_GATEWAY=fake`).
- New guest POST routes call `assertSameOrigin` (`src/server/auth/guard.ts`).
- `/sign-in` and `/my-bookings`: `robots: { index: false }`, dynamic.
- Keep existing button/label text used by e2e specs (`Full name`, `Mobile number`, `More participants`, `Choose …`, `Continue`, `Pay …`); the `Email` field stays labelled `Email`.
- Admin/scanner auth (`admin_session`) is untouched.

## Review Focus

1. **DNS failure while checking an email** (timeout, SERVFAIL): the guest must not be blocked; only a definite "domain has no MX and no A record" fails. → test in Task 3.
2. **Mixed-case or padded emails** (`" Asha@Example.COM "` from Google vs a booking stored lower-case): My bookings and resend ownership must still match. → tests in Tasks 2 and 7.
3. **Session gone after the hold exists**: `/api/holds/current` and `/api/payments/verify` must keep working without a session. → test in Task 4.
4. **Open redirect through `next`** (`//evil.com`, `https://evil.com`, `/\evil.com`): must fall back to `/my-bookings`. → test in Task 2.
5. **Switching account with a hold in progress**: the old hold token and attendee details must be cleared so the new account doesn't resume someone else's hold. → test in Task 5.

---

### Task 1: Supabase config and env keys

**Files:**
- Modify: `package.json` (deps), `src/lib/env.ts`, `.env.example`, `README.md` (env table and the `.env.test` block)
- Test: `tests/unit/env.test.ts`

**Interfaces:**
- Produces: `env.NEXT_PUBLIC_SUPABASE_URL: string`, `env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string`, `env.GUEST_AUTH: "supabase" | "fake"` (default `"supabase"`).

- [ ] **Step 1: Install** `npm install @supabase/ssr @supabase/supabase-js` (latest; note versions in the commit message).
- [ ] **Step 2: Write failing tests** in `tests/unit/env.test.ts`, following the file's existing `parseEnv` style:
  - `"requires the Supabase URL and publishable key"`: base env without `NEXT_PUBLIC_SUPABASE_URL` → throws naming that key; same for `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; URL must be a URL.
  - `"GUEST_AUTH defaults to supabase"`: `parseEnv(base).GUEST_AUTH === "supabase"`.
  - `"GUEST_AUTH=fake is refused in production"`: `NODE_ENV=production, GUEST_AUTH=fake` throws `/GUEST_AUTH=fake is not allowed when NODE_ENV=production/`; allowed with `ALLOW_TEST_MODES=1`; refused again when `VERCEL=1`.
- [ ] **Step 3: Run** `npx vitest run tests/unit/env.test.ts` → FAIL.
- [ ] **Step 4: Implement** in `src/lib/env.ts`: `NEXT_PUBLIC_SUPABASE_URL: z.string().url()`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secret`, `GUEST_AUTH: z.enum(["supabase","fake"]).default("supabase")` with a doc comment like `PAYMENT_GATEWAY`'s, and a `superRefine` issue next to the `PAYMENT_GATEWAY` one. Add both public keys to `.env.example`; add `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test` to the README's `.env.test` block and to the local `.env.test`; add README env-table rows ("Supabase dashboard > Project settings > API").
- [ ] **Step 5: Run** `npx vitest run tests/unit/env.test.ts` → PASS; `npx tsc --noEmit` → clean.
- [ ] **Step 6: Commit** `package.json package-lock.json src/lib/env.ts .env.example README.md tests/unit/env.test.ts` — `feat: Supabase env keys and GUEST_AUTH mode`.

### Task 2: Guest identity (`getGuest`, fake cookie, `safeNext`)

**Files:**
- Create: `src/server/guestAuth/supabaseServer.ts`, `src/server/guestAuth/getGuest.ts`, `src/server/guestAuth/fakeGuest.ts`, `src/lib/safeNext.ts`
- Test: `tests/unit/guestAuth.test.ts`, `tests/unit/safeNext.test.ts`

**Interfaces:**
- Consumes: `env` keys from Task 1.
- Produces:
  - `type Guest = { userId: string; email: string; name: string | null }` (exported from `getGuest.ts`).
  - `createSupabaseServer(): Promise<SupabaseClient>` — `createServerClient` over `await cookies()`; `setAll` wrapped in try/catch (server components can't set cookies).
  - `guestFromUser(user: User | null): Guest | null` — null if no user or `email_confirmed_at` unset; email trimmed + lower-cased; name from `user_metadata.full_name ?? user_metadata.name ?? null`.
  - `getGuest(): Promise<Guest | null>` — test override first; `GUEST_AUTH=fake` → `readFakeGuest(cookie "guest_fake")`; else `guestFromUser((await supabase.auth.getUser()).data.user)`; any thrown error → log and `null`.
  - `setGuestForTests(o: { guest: Guest | null } | null): void` — `null` removes the override.
  - `FAKE_GUEST_COOKIE = "guest_fake"`, `signFakeGuest(g: Guest): string`, `readFakeGuest(v: string | undefined): Guest | null` — value is `base64url(JSON) + "." + HMAC-SHA256(SESSION_SECRET)`, compared with `timingSafeEqual`.
  - `safeNext(next: string | null | undefined): string` — returns `next` only if it starts with `/`, not `//` or `/\`; else `"/my-bookings"`.

- [ ] **Step 1: Write failing tests.**
  - `safeNext.test.ts`: `"/my-bookings"`→same; `"/register/seats?x=1"`→same; `"//evil.com"`, `"/\\evil.com"`, `"https://evil.com"`, `""`, `null`→`"/my-bookings"`.
  - `guestAuth.test.ts`: `guestFromUser(null)`→null; unconfirmed user→null; `{ email: " Asha@Example.COM ", email_confirmed_at: "…", user_metadata: { full_name: "Asha Rao" } }`→`{ userId, email: "asha@example.com", name: "Asha Rao" }`; `readFakeGuest(signFakeGuest(g))` equals `g`; tampered payload or signature → null; `undefined` → null.
- [ ] **Step 2: Run** `npx vitest run tests/unit/safeNext.test.ts tests/unit/guestAuth.test.ts` → FAIL.
- [ ] **Step 3: Implement** the four files per Interfaces.
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit** `src/server/guestAuth src/lib/safeNext.ts tests/unit/guestAuth.test.ts tests/unit/safeNext.test.ts` — `feat: getGuest identity and safe redirects`.

### Task 3: Email checks before sending a code

**Files:**
- Create: `src/server/guestAuth/checkEmail.ts`, `src/app/api/auth/check-email/route.ts`
- Test: `tests/unit/checkEmail.test.ts`, `tests/integration/checkEmail.route.test.ts`

**Interfaces:**
- Produces:
  - `type EmailCheck = { ok: true; email: string } | { ok: false; reason: "format" | "no_mail_server" | "disposable" | "typo"; suggestion?: string }`
  - `type MailResolver = { resolveMx(domain: string): Promise<unknown[]>; resolve4(domain: string): Promise<unknown[]> }` (default: `node:dns/promises`).
  - `checkEmail(email: string, resolver?: MailResolver): Promise<EmailCheck>`
  - `POST /api/auth/check-email` `{ email }` → 200 with `EmailCheck`; 400 bad JSON; 403 bad Origin; 429 over 20 per 600 s per IP (`rateLimit("checkemail:ip:<ip>", 20, 600)`).
- Rules: format = zod `email()` on the trimmed value; typo = domain within Levenshtein distance ≤ 2 of `gmail.com, yahoo.com, yahoo.co.in, outlook.com, hotmail.com, icloud.com, rediffmail.com` but not equal → `suggestion` is the corrected full address; disposable = domain in a built-in list (`mailinator.com, guerrillamail.com, 10minutemail.com, tempmail.com, temp-mail.org, yopmail.com, trashmail.com, sharklasers.com, getnada.com, dispostable.com, maildrop.cc, throwawaymail.com`); no_mail_server only when both lookups fail with `ENOTFOUND` or `ENODATA`. Any other DNS error → ok. Check order: format, typo, disposable, DNS.

- [ ] **Step 1: Write failing unit tests** (`checkEmail.test.ts`, fake resolver):
  - `"not-an-email"` → `{ ok: false, reason: "format" }`
  - `"asha@gmial.com"` → `{ ok: false, reason: "typo", suggestion: "asha@gmail.com" }`
  - `"x@mailinator.com"` → `reason: "disposable"`
  - resolver rejecting both with `{ code: "ENOTFOUND" }` → `reason: "no_mail_server"`
  - resolver rejecting MX with `ENODATA` but resolving A → ok
  - resolver rejecting with `{ code: "ETIMEOUT" }` → ok (Review Focus 1)
  - `" Asha@Example.com "` with MX → `{ ok: true, email: "asha@example.com" }`
- [ ] **Step 2: Write failing integration tests** (`checkEmail.route.test.ts`): wrong Origin → 403; valid body with `origin: APP_URL` → 200 JSON with `ok`; 21st call from one IP → 429. (Use an address on `example.com`; if the test DB environment has no DNS, inject the resolver by exporting `setMailResolverForTests` from `checkEmail.ts`.)
- [ ] **Step 3: Run** `npx vitest run tests/unit/checkEmail.test.ts tests/integration/checkEmail.route.test.ts` → FAIL.
- [ ] **Step 4: Implement** `checkEmail.ts` and the route (runtime `nodejs`, dynamic, `assertSameOrigin`, `jsonError`).
- [ ] **Step 5: Run** the same command → PASS.
- [ ] **Step 6: Commit** — `feat: email checks before sending a sign-in code`.

### Task 4: Bookings require a signed-in guest

**Files:**
- Modify: `src/db/schema.ts` (bookings), `src/server/holds/createHold.ts`, `src/app/api/holds/route.ts`, `src/lib/holdErrors.ts`
- Create: migration via `npm run db:generate` (expected `src/db/migrations/0005_*.sql` + snapshot)
- Test: `tests/integration/api.holds.test.ts`, `tests/integration/discount.test.ts`, `tests/integration/e2e.flow.test.ts`, `tests/unit/uiHelpers.test.ts` (or wherever `holdErrorMessage` is tested)

**Interfaces:**
- Consumes: `getGuest`, `setGuestForTests`, `Guest` (Task 2).
- Produces: `bookings.guestUserId` (`uuid("guest_user_id")`, nullable); `CreateHoldInput.guestUserId?: string`; `POST /api/holds` → `401 { error: { code: "SIGN_IN_REQUIRED" } }` without a guest; `holdErrorMessage("SIGN_IN_REQUIRED", …)` → `"Please sign in again to book your seats."`.

- [ ] **Step 1: Update existing tests.** In the three integration files, make the local `hold()`/request helper call `setGuestForTests({ guest: { userId: <fixed uuid per email>, email: body.email, name: body.name } })` before calling the route, and `setGuestForTests(null)` in `afterEach`, so current tests keep their meaning.
- [ ] **Step 2: Write failing tests** in `api.holds.test.ts`:
  - `"POST /api/holds without a guest is 401 SIGN_IN_REQUIRED"` (override `{ guest: null }`), and no booking row is created.
  - `"booking email is the guest's, not the body's"`: guest `asha@example.com`, body email `other@example.com` → stored `email === "asha@example.com"`, `guestUserId` equals the guest's id.
  - `"held seats can still be paid after sign-out"` (Review Focus 3): create a hold with a guest, set `{ guest: null }`, then `POST /api/holds/current` with the access token → 200.
  - `holdErrorMessage("SIGN_IN_REQUIRED", "")` returns the exact string above.
- [ ] **Step 3: Run** `npx vitest run tests/integration/api.holds.test.ts` → new tests FAIL.
- [ ] **Step 4: Implement.** Add the column; run `npm run db:generate` and check the SQL is a single nullable `ADD COLUMN`; `createHold` writes `guestUserId`; the route calls `getGuest()` after the rate limit and before parsing Turnstile, throws `AppError("SIGN_IN_REQUIRED", "Sign in to book", 401)` when null, and passes `email: guest.email, guestUserId: guest.userId` (body `email` ignored; `HoldInput` keeps accepting it so old clients don't 400).
- [ ] **Step 5: Run** `npm run db:migrate` against the dev DB, then `npm test` → all PASS.
- [ ] **Step 6: Commit** — `feat: holds require a verified guest; store guest_user_id`.

### Task 5: Sign-in UI, callback and sign-out

**Files:**
- Create: `src/lib/supabase/browser.ts`, `src/lib/turnstile.ts` (moved out of `CheckoutForm.tsx`), `src/components/GuestSignIn.tsx`, `src/app/auth/callback/route.ts`, `src/app/api/auth/sign-out/route.ts`, `src/app/sign-in/page.tsx`, `src/lib/guestSignOut.ts`
- Modify: `src/components/CheckoutForm.tsx` (import the loader)
- Test: `tests/unit/GuestSignIn.test.tsx`, `tests/unit/guestSignOut.test.ts`

**Interfaces:**
- Consumes: `safeNext`, `getGuest`, `FAKE_GUEST_COOKIE`.
- Produces:
  - `createSupabaseBrowser(): SupabaseClient` (`createBrowserClient` with the public keys, memoised).
  - `loadTurnstile(): Promise<TurnstileApi>` and `type TurnstileApi` from `src/lib/turnstile.ts`.
  - `type GuestAuthClient = { sendCode(email: string, captchaToken: string): Promise<{ error: string | null }>; verifyCode(email: string, code: string): Promise<{ error: string | null }>; google(next: string): Promise<void> }`; default implementation wraps `signInWithOtp({ email, options: { shouldCreateUser: true, captchaToken } })`, `verifyOtp({ email, token, type: "email" })`, `signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` } })`.
  - `<GuestSignIn next={string} client?={GuestAuthClient} checkEmail?={(email) => Promise<EmailCheck>} />` — steps: email → (check) → code. On verify success: `router.replace(next)` then `router.refresh()`.
  - `GET /auth/callback?code&next` → `exchangeCodeForSession(code)`; success → redirect `safeNext(next)`; failure → `/sign-in?error=google&next=…`.
  - `POST /api/auth/sign-out` (`assertSameOrigin`) → Supabase `signOut()` server-side and clears `guest_fake`; 200.
  - `guestSignOut(): Promise<void>` — calls the route, then `clearAttendee()` and `clearHoldToken()`.
- Copy (exact): button `Continue with Google`; email button `Email me a code`; code label `6-digit code`; verify button `Verify and continue`; wrong code `That code didn't work. Check it or send a new one.`; resend `Send again` / `Send again in {n}s`; hint `Can't find it? Check spam, or continue with Google.`; Google error `Google sign-in didn't finish. Try again or use an email code.`; Supabase unreachable `Sign-in is having trouble. Try again shortly.`; typo `Did you mean {suggestion}?` (button applies it); no mail server `That email domain can't receive mail. Check the spelling.`; disposable `Please use your own email, not a temporary one.`
- `/sign-in` page: `BrandPage`, cream card, `PageIntro` eyebrow `ONE·26 · Your tickets`, title `Sign in`; if `getGuest()` already returns a guest → `redirect(safeNext(next))`; shows the Google error copy when `?error=google`.

- [ ] **Step 1: Write failing component tests** (`GuestSignIn.test.tsx`, fake client and fake `checkEmail`, mock `next/navigation`):
  - typo result shows `Did you mean asha@gmail.com?` and `sendCode` is not called; clicking it fills the field.
  - ok result calls `sendCode` with the trimmed lower-case email and shows `6-digit code`.
  - `verifyCode` error shows the wrong-code copy; success calls `router.replace("/register")`.
  - `Send again` is disabled with `Send again in 60s` right after sending.
- [ ] **Step 2: Write failing test** `guestSignOut.test.ts` (Review Focus 5): with an attendee in sessionStorage and a hold token in localStorage (jsdom), and `fetch` stubbed OK, `guestSignOut()` leaves both empty and POSTs `/api/auth/sign-out`.
- [ ] **Step 3: Run** `npx vitest run tests/unit/GuestSignIn.test.tsx tests/unit/guestSignOut.test.ts` → FAIL.
- [ ] **Step 4: Implement** per Interfaces. Turnstile renders inside the email step with the existing site key; pass its token as `captchaToken`.
- [ ] **Step 5: Run** the tests → PASS; `npx tsc --noEmit`, `npm run lint` → clean.
- [ ] **Step 6: Manual check** against the rekindle-dev Supabase project on `npm run dev`: email code arrives and signs in; Google signs in and returns to `next`.
- [ ] **Step 7: Commit** — `feat: guest sign-in with Google or email code`.

### Task 6: Proxy session refresh and guest redirects; `/register` sign-in step

**Files:**
- Create: `src/server/guestAuth/guestGate.ts`
- Modify: `src/proxy.ts`, `src/app/register/page.tsx`, `src/components/AttendeeForm.tsx`, `src/components/BookingApp.tsx` (notice for `SIGN_IN_REQUIRED`)
- Test: `tests/unit/guestGate.test.ts`, `tests/unit/AttendeeForm.test.tsx`

**Interfaces:**
- Consumes: `getGuest`, `readFakeGuest`, `GuestSignIn`, `guestSignOut`.
- Produces:
  - `guestGate(pathname: string, search: string, signedIn: boolean): string | null` — `/register/seats` signed out → `"/register"`; `/my-bookings` signed out → `"/sign-in?next=" + encodeURIComponent(pathname + search)`; otherwise `null`.
  - `proxy`: keeps the admin branch for `/admin/:path*` and `/scan` unchanged; for `/register/:path*`, `/my-bookings`, `/sign-in`, `/auth/:path*`: in `supabase` mode build a `createServerClient` on `request.cookies`/response cookies, `await supabase.auth.getUser()` (refreshes cookies), signedIn = user with confirmed email; in `fake` mode signedIn = `readFakeGuest(cookie) !== null`; redirect when `guestGate` says so. Extend `config.matcher`.
  - `AttendeeForm` props: `{ email: string; suggestedName: string | null }`. Email input `readOnly`, `value={email}`, with `Not you? Switch account` (calls `guestSignOut()` then `router.refresh()`); name defaults to stored name, else `suggestedName`. Saved attendee uses the session email.
  - `/register` page: `const guest = await getGuest()`; signed out → `<GuestSignIn next="/register" />` in the form slot with heading `Sign in to book`; signed in → `<AttendeeForm email={guest.email} suggestedName={guest.name} />`.
  - `BookingApp`: on `SIGN_IN_REQUIRED` shows the message with a link `Sign in` to `/register`.

- [ ] **Step 1: Write failing tests.**
  - `guestGate.test.ts`: the three rules above, including `search` preserved (`/my-bookings`, `?new=K7MQ2X`, false → `/sign-in?next=%2Fmy-bookings%3Fnew%3DK7MQ2X`); `/register` signed out → null (page shows sign-in itself).
  - `AttendeeForm.test.tsx`: email input has value `asha@example.com` and is read-only; name prefilled with `suggestedName` when nothing stored; submit saves the attendee with that email.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run** `npm test` → PASS; `npx tsc --noEmit`, `npm run lint` → clean.
- [ ] **Step 5: Manual check:** signed out `/register/seats` → `/register`; `/register` shows the sign-in card; after sign-in the form shows the locked email; Switch account returns to the sign-in card.
- [ ] **Step 6: Commit** — `feat: sign-in step on /register and guest route guard`.

### Task 7: Guest bookings data and ticket resend

**Files:**
- Create: `src/server/bookings/listGuestBookings.ts`, `src/server/bookings/guestResend.ts`, `src/app/api/my-bookings/[id]/resend/route.ts`
- Modify: `src/server/admin/bookings.ts` (extract shared outbox insert)
- Test: `tests/integration/myBookings.test.ts`

**Interfaces:**
- Consumes: `getGuest`, `setGuestForTests`, `rateLimit`, `kickOutbox`, `assertSameOrigin`.
- Produces:
  - `queueTicketsEmail(tx, bookingId: string): Promise<{ publicCode: string }>` in `src/server/admin/bookings.ts` — the `FOR SHARE` read, the `paid`/`comp` rule (`409 NOT_RESENDABLE`), the outbox insert; `resendTickets` calls it then `logAudit`.
  - `type GuestBooking = { id: string; publicCode: string; accessToken: string; status: Booking["status"]; amountPaise: number; holdExpiresAt: Date; createdAt: Date; seats: { label: string; tierName: string }[] }`
  - `listGuestBookings(email: string, now?: Date): Promise<GuestBooking[]>` — `lower(trim(email)) = lower(trim($1))`, newest first, excludes `expired` and `pending` whose `hold_expires_at <= now`; seats ordered by label (same join as `loadBookingWithTickets`).
  - `resendForGuest(bookingId: string, guestEmail: string): Promise<void>` — booking not found or email mismatch → `AppError("NOT_FOUND", …, 404)`; then `queueTicketsEmail`.
  - `POST /api/my-bookings/[id]/resend` → `assertSameOrigin`; no guest → 401 `SIGN_IN_REQUIRED`; `rateLimit("resend:booking:<id>", 3, 3600)` → 429; `resendForGuest`; `kickOutbox()`; `{ ok: true }`.

- [ ] **Step 1: Write failing integration tests** (`myBookings.test.ts`, seed via existing helpers, set statuses with direct updates):
  - `listGuestBookings("asha@example.com")` returns a paid booking stored as `"Asha@Example.com "` (Review Focus 2), a `refunded` one and an active `pending`; excludes an expired `pending`, an `expired`, and other emails; newest first; seats carry labels and tier names.
  - Resend: owner → 200 and one new `tickets` outbox row; other guest → 404; `pending` → 409; unsigned → 401; 4th call within the hour → 429; wrong Origin → 403.
  - Admin resend still writes its audit entry (existing test passes unchanged).
- [ ] **Step 2: Run** `npx vitest run tests/integration/myBookings.test.ts` → FAIL.
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat: guest booking list and ticket resend`.

### Task 8: My bookings page, header link, post-payment landing

**Files:**
- Create: `src/app/my-bookings/page.tsx`, `src/components/MyBookingCard.tsx`, `src/components/FinishPayingButton.tsx`, `src/components/ResendMyTicketsButton.tsx`, `src/components/SignOutButton.tsx`
- Modify: `src/components/landing/links.ts` (`myBookings: "/my-bookings"`), `src/components/landing/LandingHeader.tsx` (desktop link + `MENU` item `My bookings`), `src/components/landing/BrandPage.tsx` (`current` accepts `"my-bookings"`), `src/components/ConfirmPayment.tsx`, `src/app/booking/[token]/page.tsx`
- Test: `tests/unit/MyBookingCard.test.tsx`

**Interfaces:**
- Consumes: `getGuest`, `listGuestBookings`, `GuestBooking`, `bookingStatusLabel`, `formatInr`, `saveHoldToken`, `guestSignOut`.
- Produces:
  - `/my-bookings?new=<publicCode>`: no guest → `redirect("/sign-in?next=/my-bookings")`; header row with email and `Sign out`; cards; the card whose `publicCode` equals `new` is first and has `aria-current="true"` plus a "Just booked" tag; empty state `No bookings yet for this email` + `Save your seat` → `/register`.
  - `MyBookingCard({ booking, highlight })`: chip = `bookingStatusLabel(status)`; `paid`/`comp` → link `View tickets` (`/booking/<accessToken>`) and `ResendMyTicketsButton` (`Resend ticket email` → `Sent. Check your inbox.`; 429 → `Already resent recently. Try again in an hour.`); active `pending` → `FinishPayingButton` (`Finish paying`: `saveHoldToken(accessToken)` then `router.push("/register/seats")`); others → no actions.
  - `ConfirmPayment` navigates to `/booking/<token>?paid=1`.
  - `/booking/[token]`: when `searchParams.paid === "1"`, `getGuest()` and the booking email (lower/trim) equal → `redirect("/my-bookings?new=" + publicCode)`; otherwise render as today.

- [ ] **Step 1: Write failing tests** (`MyBookingCard.test.tsx`): paid → `View tickets` href `/booking/tok` and `Resend ticket email`; active pending → `Finish paying` stores the token (spy `saveHoldToken`) and pushes `/register/seats`; refunded → chip `Refunded`, no buttons; `highlight` → `aria-current="true"`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** per Interfaces, in the cream `BrandPage` style used by `/booking/find`.
- [ ] **Step 4: Run** `npm test` → PASS; `npx tsc --noEmit`, `npm run lint` → clean.
- [ ] **Step 5: Manual check** at phone and desktop width: header link, empty state, a paid booking, resend, Finish paying on a second browser.
- [ ] **Step 6: Commit** — `feat: My bookings page and post-payment landing`.

### Task 9: E2E fake sign-in, specs, launch docs

**Files:**
- Create: `src/app/api/dev/guest-sign-in/route.ts`
- Modify: `playwright.config.ts` (`GUEST_AUTH: "fake"`), `tests/e2e/helpers.ts`, `tests/e2e/booking.spec.ts`, `README.md`, `docs/LAUNCH_CHECKLIST.md`
- Test: `tests/e2e/booking.spec.ts`, `tests/e2e/myBookings.spec.ts`

**Interfaces:**
- Consumes: `signFakeGuest`, `FAKE_GUEST_COOKIE`, `env.GUEST_AUTH`.
- Produces:
  - `POST /api/dev/guest-sign-in` `{ email, name? }` → 404 unless `env.GUEST_AUTH === "fake"`; sets `guest_fake` (HttpOnly, SameSite=Lax, Path=/) with `userId` = deterministic uuid v5-style hash of the email (any stable uuid string).
  - `signInGuest(page: Page, email: string, name?: string): Promise<void>` in `tests/e2e/helpers.ts`; `startBooking` calls it first and no longer fills `Email`.

- [ ] **Step 1: Update** `startBooking` and `booking.spec.ts`: after payment, expect URL `/my-bookings?new=<code>` and a card with `Confirmed`; then `View tickets` shows two QR images (keep the rest of the gate flow, reading `code` from the card).
- [ ] **Step 2: Write** `myBookings.spec.ts`: signed out `/my-bookings` → `/sign-in?next=…`; signed-out `/register/seats` → `/register` showing `Continue with Google`; after `signInGuest`, `/register` shows the locked email.
- [ ] **Step 3: Run** `npx playwright test` → new expectations FAIL.
- [ ] **Step 4: Implement** the dev route and config change.
- [ ] **Step 5: Run** `npx playwright test` → all PASS.
- [ ] **Step 6: Docs.** README: guest sign-in paragraph (setup section), `/my-bookings` and `/sign-in` URLs. `docs/LAUNCH_CHECKLIST.md`: the spec's seven Supabase dashboard steps for both projects, Google Cloud OAuth client, Resend SMTP, production `DATABASE_URL` = pooled string (port 6543), migrations on the direct string (port 5432), Vercel env keys `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and "never set `GUEST_AUTH` in production".
- [ ] **Step 7: Final verification:** `npx tsc --noEmit`, `npm run lint`, `npm test`, `npx playwright test` all clean.
- [ ] **Step 8: Commit** (code and README/LAUNCH_CHECKLIST only) — `test: e2e guest sign-in; docs: Supabase launch setup`.
