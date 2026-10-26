# Event booking

A single-event seat-booking website. Guests pick seats on a map, the seats are held for a few minutes, they pay with Razorpay, and they receive an email with one QR ticket per seat. Staff check guests in at the gate with the built-in scanner page; the organizer manages seats, prices, comps and exports from an admin area.

Stack: Next.js (App Router, TypeScript), PostgreSQL 16, Drizzle ORM, Razorpay, Resend (email), Cloudflare Turnstile (bot check).

## Prerequisites

- Node 22 or newer
- PostgreSQL 16 (Docker, or a local install)

## Setup

```bash
npm install
docker compose up -d                 # Postgres on :5434 (app) and :5433 (tests). Skip if you run Postgres yourself.
cp .env.example .env.local           # then fill in the values (table below)
# create .env.test by hand (see "Testing"; it is git-ignored, so it cannot be copied from the repo)
npm run db:migrate
npm run seed:seats -- scripts/sample-venue.csv --create-tiers
npm run admin:create -- you@example.com admin
npm run dev
```

Open http://localhost:3000 for the landing page, http://localhost:3000/register for seat booking, and http://localhost:3000/admin/login for the admin area. Guests who lost their email can get their tickets back at http://localhost:3000/booking/find. To cancel a paid booking, open it in Admin > Bookings and use **Cancel & refund** (frees the seats, voids the QR codes, refunds in full); complimentary bookings have **Cancel comp** instead (no refund, the guest is emailed). Full refunds made in the Razorpay dashboard cancel the booking too, via the webhook or, if that is lost, the reconcile job.

Notes:

- With the Docker database, `DATABASE_URL` is `postgres://postgres:postgres@127.0.0.1:5434/booking`. It uses port 5434, not 5432, so it does not clash with a Postgres installed directly on the machine (which usually takes 5432).
- Event name, date and venue are placeholders in `src/lib/event.ts`. Edit them before launch.
- On a fresh clone run `npx next typegen` before `npx tsc --noEmit`.
- The gate scanner uses the phone camera, which browsers only allow on HTTPS. To try it locally use `npx next dev --experimental-https`.
- To create a scanner login: `npm run admin:create -- gate@example.com scanner`. Add `--reset-password` to change a password.
- Seat CSV columns: `section,row,number,x,y,tier` (see `scripts/sample-venue.csv`). `--create-tiers` creates tiers named in the CSV that do not exist yet. Gold and Silver get Rs 1,500 and Rs 800; any other name gets a placeholder price (the script warns). Set the real prices in Admin > Tiers.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Unit and integration tests (vitest, needs the test Postgres) |
| `npm run lint` | ESLint |
| `npm run db:generate` | Create a migration after changing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run seed:seats -- <file.csv> [--create-tiers]` | Import the seat map |
| `npm run admin:create -- <email> <admin\|scanner> [--reset-password]` | Create a staff user |
| `npx playwright test` | Browser end-to-end tests |
| `k6 run tests/load/hold.k6.js` | Load test (staging only) |

## Environment keys

Set these in `.env.local` for development and in the hosting dashboard for production.

| Key | What it is / where to get it |
|---|---|
| `DATABASE_URL` | Postgres connection string. In production use the pooled URL. |
| `RAZORPAY_KEY_ID`, `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Razorpay dashboard > API keys (same key id in both). Use test keys until launch. |
| `RAZORPAY_KEY_SECRET` | Razorpay dashboard > API keys. |
| `RAZORPAY_WEBHOOK_SECRET` | The secret you type when creating the webhook in Razorpay. It is NOT the key secret. |
| `RESEND_API_KEY` | resend.com > API keys. |
| `EMAIL_FROM` | Sender address on a domain verified in Resend, e.g. `tickets@yourdomain.com`. |
| `TURNSTILE_SECRET`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare dashboard > Turnstile (secret key and site key). |
| `CRON_SECRET` | Any long random string. Cron calls must send it (Vercel sends it automatically). |
| `SESSION_SECRET` | Any random string of 32+ characters. |
| `APP_URL` | Public base URL, e.g. `https://tickets.yourdomain.com`. Used in emails and the Origin check. |
| `PAYMENT_GATEWAY` | Optional. `razorpay` (default) or `fake`. `fake` is for browser tests only. |
| `LOAD_TEST_DISABLE_RATE_LIMIT` | Optional. `1` turns off the per-IP hold limits for a staging load run; only honoured together with `ALLOW_TEST_MODES=1`, never on Vercel. Remove afterwards. |
| `ALLOW_TEST_MODES` | Optional. `1` lets a production-mode server accept `PAYMENT_GATEWAY=fake` and `TURNSTILE_SECRET=test`. Browser tests only. Must be unset in production; ignored when `VERCEL` is set. |

## Testing

### Unit and integration tests

They run against a real Postgres, never mocks. Create `.env.test` in the repo root with exactly these dummy values (the database must be named `booking_test`):

```
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/booking_test
RAZORPAY_KEY_ID=rzp_test_dummy
RAZORPAY_KEY_SECRET=test_key_secret
RAZORPAY_WEBHOOK_SECRET=test_webhook_secret
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_dummy
RESEND_API_KEY=test
EMAIL_FROM=tickets@example.com
TURNSTILE_SECRET=test
NEXT_PUBLIC_TURNSTILE_SITE_KEY=test
CRON_SECRET=test_cron
SESSION_SECRET=test_session_secret_at_least_32_chars_long
APP_URL=http://localhost:3000
```

Then `docker compose up -d db-test` and `npm test`. `tests/integration/e2e.flow.test.ts` walks the whole journey without a browser (seat map, hold, payment, email with QR codes, gate scan green then red, plus a two-guest race) and finishes by asserting that no seat is double-booked.

### Browser end-to-end tests (Playwright)

```bash
npx playwright install chromium
npx playwright test
```

Playwright builds the app, starts it on port 3100 against `booking_test` (it empties and re-seeds that database; it refuses to run against any database not ending in `_test`), and uses an in-memory fake payment gateway so no Razorpay account is needed. Only the Razorpay popup is stubbed. The server runs with `NODE_ENV=production`, where the app refuses `PAYMENT_GATEWAY=fake` and `TURNSTILE_SECRET=test`, so the config sets the explicit escape hatch `ALLOW_TEST_MODES=1`. That flag is ignored whenever `VERCEL` is set, so it can never take effect on Vercel, and it must never be set on a real deployment.

### Load test (k6)

Run against staging only: it creates real holds and Razorpay orders.

```bash
k6 run -e BASE_URL=https://staging.example.com tests/load/hold.k6.js
psql "$STAGING_DATABASE_URL" -f tests/load/check-double-booking.sql   # must return 0 rows
```

Thresholds: p95 request time under 500 ms, checks above 99%. See the comments at the top of the script for Turnstile and rate-limit details.

## Deploying

Follow `docs/LAUNCH_CHECKLIST.md`.
