# Guest sign-in and My bookings (Supabase)

## Intent

Guests must prove their email is real before they can book, and must be able to come back later and see every ticket they booked. The owner chose Supabase as the platform: it hosts the production database now and handles guest sign-in now; staff logins move to it in a later phase.

**Decided with the owner**

- Supabase hosts the production Postgres and provides guest auth (Supabase Auth).
- Sign-in methods: **Continue with Google** and **a 6-digit email code**. Both end in the same Supabase session.
- Sign-in is **required before booking**, as the first step of `/register`. A slow code email can't cost seats, because nothing is held yet.
- Instant email checks (format, MX record, throwaway domains, typo suggestion) run before any code is sent.
- After payment the guest lands on **My bookings**. Returning guests sign in and see all bookings made with their email.
- My bookings: view tickets and resend the ticket email. No guest cancellation.
- `/booking/find` (booking code + email) stays as a fallback.
- Integration: server-side Supabase sessions in cookies (`@supabase/ssr`). The browser only starts sign-in; the server reads the verified email and enforces it.

**Out of scope (later specs):** staff, admin, scanner and developer logins on Supabase (the current `admin_sessions` auth is untouched); guest self-cancellation and refunds; WhatsApp or SMS codes; browser access to tables through Supabase row-level security.

## 1. User flow and pages

### Booking (new guest)

1. **`/register`**: the details card opens on a sign-in step instead of the form.
   - **Continue with Google**, or
   - **Email me a code**: the guest types an email; `POST /api/auth/check-email` runs the instant checks; if they pass, a 6-digit code is sent and entered on the same card.
2. Once signed in, the card shows the existing details form. The email is filled in from the session and read-only, with a **Not you? Switch account** link. Name and phone are entered as today; Google pre-fills the name when the form is empty.
3. **`/register/seats`** is unchanged. A signed-out visitor (old tab, direct link) is redirected to `/register`.
4. Payment → `/booking/success` → once the payment is confirmed, `ConfirmPayment` opens `/booking/<token>?paid=1`; that server page sees the signed-in guest owns the booking and redirects to **`/my-bookings?new=<publicCode>`**, which highlights that booking at the top. If the guest is no longer signed in, the ticket page shows as today.

A guest who is already signed in skips the sign-in step on `/register`.

### Returning guest

- **My bookings** is added to the header (desktop links and mobile menu). It goes to `/my-bookings`.
- Signed out, `/my-bookings` redirects to **`/sign-in?next=/my-bookings`**: a cream paper page with the same sign-in card. After signing in the guest returns to `next`.

### `/my-bookings`

Cream paper page in the current site style (`BrandPage`).

- Header row: the signed-in email and **Sign out**.
- One card per booking for that email, newest first: booking code, seats (section/row/number), amount, and a status chip.

Chip text comes from the existing `bookingStatusLabel` (`src/lib/bookingStatus.ts`).

| `bookings.status` | Shown? | Chip | Actions |
|---|---|---|---|
| `paid`, `comp` | yes | Confirmed | **View tickets** (existing `/booking/[token]` page), **Resend ticket email** |
| `pending`, hold not expired | yes | Payment processing | **Finish paying**: saves the booking's access token with `saveHoldToken`, then opens `/register/seats`, where the existing resume-hold flow picks it up (works on any device) |
| `pending`, hold expired; `expired` | no (abandoned holds) | — | — |
| `refund_due` | yes | Refund in progress | none |
| `refunded` | yes | Refunded | none |
| `cancelled` | yes | Cancelled | none |

- Empty state: "No bookings yet for this email" and a **Save your seat** button to `/register`.

### Unchanged

`/booking/find`; ticket links in emails (token links, no sign-in needed); the seat map; Razorpay payment; admin and scanner pages.

## 2. Architecture

### Packages and configuration

- `@supabase/supabase-js`, `@supabase/ssr`.
- New env keys: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. No service-role key in this phase. Add both to `.env.example`, the README key table and `src/lib/env.ts`.

### Modules

| Unit | Purpose |
|---|---|
| `src/lib/supabase/browser.ts` | Browser Supabase client. Used only for `signInWithOAuth` (Google), `signInWithOtp` and `verifyOtp` (email code), and `signOut`. |
| `src/server/guestAuth/supabaseServer.ts` | Server Supabase client built on Next's `cookies()`. |
| `src/server/guestAuth/getGuest.ts` | `getGuest(): Promise<{ userId: string; email: string; name: string \| null } \| null>` (name from Google's profile, used to pre-fill the form). Calls `supabase.auth.getUser()` (verified with Supabase, never the unverified cookie session), requires a confirmed email, returns the email lowercased and trimmed. **The only source of guest identity.** Replaceable in tests. |
| `src/server/guestAuth/safeNext.ts` | Accepts only same-site relative paths (`/…`, not `//…`); anything else becomes `/my-bookings`. |
| `src/server/guestAuth/checkEmail.ts` | Format check, MX lookup (injectable DNS resolver), throwaway-domain list, typo suggestion for common domains (gmail, yahoo, outlook, hotmail, icloud, rediffmail). |
| `src/app/auth/callback/route.ts` | Google return route: `exchangeCodeForSession`, then redirect to `safeNext(next)`. On error, redirect to `/sign-in?error=google`. |
| `src/app/api/auth/check-email/route.ts` | `POST { email }` → `{ ok: true }` or `{ ok: false, reason, suggestion? }`. Rate-limited per IP with `rateLimit`. |
| `src/components/GuestSignIn.tsx` | The sign-in card (Google button, email field, code entry, resend timer, errors). Used by `/register` and `/sign-in`. |
| `src/app/sign-in/page.tsx` | Sign-in page; redirects to `next` if already signed in. |
| `src/app/my-bookings/page.tsx` | Server component: `getGuest()` or redirect; loads bookings; renders cards. |
| `src/server/bookings/listGuestBookings.ts` | Drizzle query: bookings where `lower(trim(email)) = guest email`, with seats and tier, newest first. |
| `src/app/api/my-bookings/[id]/resend/route.ts` | Guest-owned resend of the ticket email. |
| `src/proxy.ts` | Keeps the admin redirect. Adds Supabase session refresh for guest routes and an early redirect to sign-in for `/register/seats` and `/my-bookings`. |

### Server enforcement

- **`POST /api/holds`** calls `getGuest()` first. No guest → `401 { error: { code: "SIGN_IN_REQUIRED" } }`. The booking's `email` is set from the guest, and any `email` in the request body is ignored. `name` and `phone` still come from the body.
- New nullable column **`bookings.guest_user_id uuid`**, set on new bookings (migration `0005`; `0004` is discount codes). No foreign key to Supabase's `auth.users`, because local and test databases do not have that schema.
- **My bookings** matches by `lower(trim(email))`, so bookings made before sign-in existed appear too.
- **`POST /api/my-bookings/[id]/resend`**: `assertSameOrigin`, requires a guest, the booking's email must equal the guest's email (otherwise 404, so nothing is revealed), status must be `paid` or `comp` (same rule as the admin resend, otherwise 409), limit 3 per booking per hour. It inserts a `tickets` row into `email_outbox` and calls `kickOutbox()`, like the admin route. The outbox insert and status rule are shared with `resendTickets` in `src/server/admin/bookings.ts`; the admin audit-log entry stays admin-only.
- Hold resume, release and payment (`/api/holds/current`, `/api/payments/verify`) stay token-based and do not require a session, so a session expiring mid-payment never loses held seats.
- Existing `holdErrorMessage` gains `SIGN_IN_REQUIRED`; the seat step sends the guest to `/register` when it sees it.

### Client state

- On sign-in, the attendee details form reads the email from the session; `src/lib/attendee.ts` keeps name and phone in sessionStorage as today.
- **Sign out** and **Switch account** call `POST /api/auth/sign-out` (Supabase `signOut()` on the server, which clears the session cookies), then clear the stored attendee details and the active-hold token (`clearHoldToken`). An abandoned hold expires on its own.
- Post-payment landing: see step 4 of the booking flow.

### Supabase project setup (owner, in the dashboard)

Two projects: **rekindle-dev** (localhost and Vercel previews) and **rekindle-prod**.

1. **Auth → Providers → Email:** on; confirm email on.
2. **Auth → Email templates → Magic link / OTP:** body uses `{{ .Token }}` (a 6-digit code), not a link. Branded with the ONE·26 name.
3. **Auth → Settings:** email OTP expiry 600 s (10 minutes); OTP length 6.
4. **Auth → SMTP:** custom SMTP through Resend (`smtp.resend.com`, port 465, user `resend`, password = a Resend API key), sender = `EMAIL_FROM`. The built-in sender allows only a few emails per hour.
5. **Auth → Providers → Google:** on, with a Google Cloud OAuth client (web). Google Cloud consent screen: app name ONE·26 Rekindle, scopes email and profile. Authorised redirect URI: `https://<project>.supabase.co/auth/v1/callback`.
6. **Auth → URL configuration:** site URL = `APP_URL`; redirect allow-list: `http://localhost:3000/auth/callback`, the Vercel preview pattern, and the production URL.
7. **Auth → Bot and abuse protection:** CAPTCHA on with Cloudflare Turnstile (the existing site key's secret). `GuestSignIn` passes the Turnstile token to `signInWithOtp`.

### Database hosting

- Production `DATABASE_URL` = Supabase **pooled** connection string (transaction mode, port 6543). `drizzle-kit migrate` runs against the **direct** connection string (port 5432), passed as `DATABASE_URL` for that command only.
- The Drizzle schema lives in the `public` schema; Supabase's `auth` schema is not touched by migrations.
- Local development and tests keep the Docker Postgres. Local auth uses the rekindle-dev project.

## 3. Errors and edge cases

| Situation | Behaviour |
|---|---|
| Wrong or expired code | "That code didn't work. Check it or send a new one." |
| Resend code | Allowed after 60 s (Supabase's per-email limit); the button shows the countdown. |
| Code not arriving | Card hints to check spam and offers Continue with Google. |
| check-email fails | Inline message; typo shows "Did you mean …@gmail.com?" as a one-tap fix. No code is sent. |
| Google cancelled or failed | Back to the sign-in card with a short message. |
| Session gone before the hold is created | `POST /api/holds` → 401 → the guest signs in again; name and phone are kept. |
| Session gone after the hold is created | Payment continues on the hold token. |
| Supabase unavailable | Landing, line-up, `/booking/find` and emailed ticket links work. Sign-in shows "Sign-in is having trouble, try again shortly." New bookings wait. |
| Same email via Google and code | One Supabase user (automatic identity linking). Bookings are keyed by email either way. |

## 4. Security

- Server code trusts only `getGuest()` (`getUser()`), never `getSession()` or browser-sent emails.
- `next` redirects pass through `safeNext`.
- `check-email` never reveals whether an email has bookings.
- The resend route checks ownership and returns 404 for bookings that aren't the guest's.
- `/my-bookings` and `/sign-in`: `robots: { index: false }`, dynamic, never cached.
- New POST routes (`check-email`, resend) call `assertSameOrigin` from `src/server/auth/guard.ts`, which today only guards admin routes.
- Known limitation: Supabase's session cookies are readable by page scripts (the browser client needs them), so an XSS bug could steal a session. Rule kept: no unescaped user content in pages.

## 5. Testing

- **Integration** (real test Postgres; `getGuest` swapped for a fake guest):
  - `POST /api/holds` without a guest → 401; with a guest, a different body email is ignored and the guest email is stored; `guest_user_id` is saved.
  - `listGuestBookings` returns old (no `guest_user_id`) and new bookings for the email, case-insensitively, and nothing for other emails.
  - Resend: owner succeeds and an outbox row is added; another guest gets 404; a `pending` booking gets 409; fourth call within an hour rate-limited; wrong Origin gets 403.
  - `check-email`: valid, bad format, no MX (fake resolver), throwaway domain, typo suggestion.
- **Unit:** `safeNext`; typo suggester.
- **E2E (Playwright):** fake sign-in mode `GUEST_AUTH=fake`, honoured only with `ALLOW_TEST_MODES=1` and never on Vercel (same rule as `PAYMENT_GATEWAY=fake`); a test-only route sets a signed fake guest cookie that `getGuest` accepts in that mode. `booking.spec` signs in, books, pays with the fake gateway, and ends on My bookings showing the booking. Existing button and label text is kept so other specs still match.
- **Manual:** real Google sign-in and a real email code against rekindle-dev on localhost and on a Vercel preview.
- `tsc`, `eslint`, `npm test`, `npx playwright test`.

## Build order (each step leaves the site working)

1. Supabase packages, env keys, browser and server clients, `getGuest`, `safeNext`, proxy session refresh.
2. `/auth/callback`, `check-email`, `GuestSignIn`, `/sign-in`.
3. Migration `0005` (`guest_user_id`); `/api/holds` requires a guest and uses the guest email.
4. `/register` sign-in step and locked email; signed-out redirect on `/register/seats`.
5. `/my-bookings`, `listGuestBookings`, resend route, header link, success redirect.
6. E2E fake sign-in mode and updated specs.
7. README and `LAUNCH_CHECKLIST.md`: Supabase project setup, Google OAuth client, SMTP, production database move.
