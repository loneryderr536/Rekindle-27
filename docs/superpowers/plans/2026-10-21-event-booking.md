# Event Seat Booking Website — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single-event website where guests pick seats on a map, pay with Razorpay, receive QR e-tickets, and staff scan them at the gate; organizers manage tiers, prices, blocks, comps and bookings.

**Architecture:** One Next.js (App Router, TypeScript) app serving React pages and API route handlers, backed by PostgreSQL. Seat safety comes from a single conditional `UPDATE` inside a transaction; payment confirmation is an idempotent `confirmBooking` called by both the browser verify call and the Razorpay webhook, with a reconcile cron as safety net.

**Tech Stack:** Next.js (App Router) · TypeScript · Tailwind + shadcn/ui · PostgreSQL 16 · Drizzle ORM + drizzle-kit · Zod · Razorpay Node SDK + Checkout.js · Resend · `qrcode` · `@zxing/browser` (scanner) · argon2 · Cloudflare Turnstile · Vitest · Playwright · k6

**Spec:** `docs/superpowers/specs/2026-10-21-event-booking-design.md`

## Global Constraints

- Money is stored and computed in **paise** as integers; currency `INR`. Never accept an amount from the browser.
- `MAX_SEATS_PER_BOOKING = 6`; `HOLD_MINUTES = 10`; Razorpay Checkout `timeout: 480` seconds.
- All timestamps `timestamptz`; all IDs `uuid` (`gen_random_uuid()`).
- Seat status enum: `available | held | sold | blocked`. Booking status enum: `pending | paid | expired | comp | refund_due | refunded`. Admin role enum: `admin | scanner`.
- Ticket token: 32 random bytes, base64url; QR payload is `RKT1:<token>` and nothing else.
- Every Razorpay callback and webhook is signature-verified (HMAC-SHA256, constant-time compare). Webhook signature is computed over the **raw** request body.
- Hold, scan and confirm logic use raw parameterized SQL through Drizzle's `sql` tag; no string concatenation of input.
- All API input validated with Zod; error responses are JSON `{ error: { code: string, message: string } }`.
- Secrets only from environment (`src/lib/env.ts`); `.env*` (except `.env.example`) git-ignored.
- `/api/cron/*` requires header `x-cron-secret: $CRON_SECRET` (Vercel Cron: `Authorization: Bearer $CRON_SECRET` also accepted).
- API route handlers run on the Node runtime (`export const runtime = "nodejs"`).
- Tests run against a real Postgres (`docker compose` service `db-test` on port 5433); no DB mocks.
- Commit after each task with a conventional-commit message.

## Review Focus

1. **Hold request with unknown, duplicate or blocked seat IDs** → rejected as a whole (`400 INVALID_SEATS` for unknown/duplicate, `409 SEATS_TAKEN` for blocked); no partial hold and no orphan booking row. *(Test added to Task 4.)*
2. **Paid amount differs from the booking amount** (tampered order, price edited mid-checkout) → booking is not confirmed; it becomes `refund_due`. *(Test added to Task 7.)*
3. **Same phone typed differently** (`98765 43210`, `+91 9876543210`, `09876543210`) → normalized to `+919876543210` so the one-active-hold limit cannot be bypassed. *(Test added to Task 3.)*
4. **Admin changes a tier price while a guest is mid-checkout** → that guest still pays the snapshot price in `booking_items`; the Razorpay order amount is unchanged. *(Test added to Task 15.)*
5. **Scanning a ticket whose booking is `refund_due`/`refunded`/`expired`** → red "Invalid ticket", never green. *(Test added to Task 13.)*

---

## File Structure

```
event-booking/
├── docker-compose.yml              # db (5432) + db-test (5433)
├── drizzle.config.ts
├── .env.example
├── vercel.json                     # cron schedules
├── src/
│   ├── lib/
│   │   ├── env.ts                  # Zod-parsed env
│   │   ├── constants.ts            # MAX_SEATS_PER_BOOKING, HOLD_MINUTES, CHECKOUT_TIMEOUT_S
│   │   ├── errors.ts               # AppError + jsonError()
│   │   ├── phone.ts                # normalizeIndianPhone()
│   │   ├── money.ts                # formatInr()
│   │   └── random.ts               # randomToken(), publicCode()
│   ├── db/
│   │   ├── schema.ts               # all tables + enums
│   │   ├── client.ts               # db, pool
│   │   └── migrations/             # drizzle-kit output
│   ├── server/
│   │   ├── seats/listSeats.ts
│   │   ├── seats/importSeats.ts    # CSV → rows
│   │   ├── holds/createHold.ts
│   │   ├── holds/schemas.ts        # HoldInput Zod
│   │   ├── security/rateLimit.ts
│   │   ├── security/turnstile.ts
│   │   ├── payments/gateway.ts     # PaymentGateway interface + Razorpay impl
│   │   ├── payments/signatures.ts
│   │   ├── payments/confirmBooking.ts
│   │   ├── payments/refunds.ts
│   │   ├── tickets/tokens.ts
│   │   ├── tickets/qr.ts
│   │   ├── email/outbox.ts
│   │   ├── email/templates.ts
│   │   ├── email/sender.ts         # EmailSender interface + Resend impl
│   │   ├── jobs/cleanup.ts
│   │   ├── jobs/reconcile.ts
│   │   ├── auth/password.ts
│   │   ├── auth/session.ts
│   │   ├── auth/guard.ts
│   │   ├── scan/scanTicket.ts
│   │   └── admin/{dashboard,bookings,export,seats,tiers,audit}.ts
│   ├── app/
│   │   ├── page.tsx                # seat map + checkout
│   │   ├── booking/[token]/page.tsx
│   │   ├── scan/page.tsx
│   │   ├── admin/(login|dashboard|bookings|seats|tiers|audit)/…
│   │   └── api/
│   │       ├── seats/route.ts
│   │       ├── holds/route.ts
│   │       ├── payments/verify/route.ts
│   │       ├── webhooks/razorpay/route.ts
│   │       ├── booking/lookup/route.ts
│   │       ├── scan/route.ts
│   │       ├── cron/cleanup/route.ts
│   │       ├── cron/reconcile/route.ts
│   │       ├── cron/outbox/route.ts
│   │       └── admin/…/route.ts
│   └── components/
│       ├── SeatMap.tsx
│       ├── CheckoutForm.tsx
│       └── QrScanner.tsx
├── scripts/
│   ├── seed-seats.ts               # npm run seed:seats -- venue.csv
│   └── create-admin.ts             # npm run admin:create -- email role
└── tests/
    ├── helpers/db.ts               # resetDb(), seedVenue(), makeBooking()
    ├── helpers/fakes.ts            # FakeGateway, FakeEmailSender
    ├── unit/…
    ├── integration/…
    ├── e2e/…                       # Playwright
    └── load/hold.k6.js
```

---

### Task 1: Project scaffold, env and test harness

**Files:**
- Create: `package.json` (via create-next-app), `docker-compose.yml`, `drizzle.config.ts`, `.env.example`, `vitest.config.ts`, `src/lib/env.ts`, `src/lib/constants.ts`, `src/lib/errors.ts`
- Test: `tests/unit/env.test.ts`

**Interfaces:**
- Produces:
  - `env` object with keys `DATABASE_URL, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, NEXT_PUBLIC_RAZORPAY_KEY_ID, RESEND_API_KEY, EMAIL_FROM, TURNSTILE_SECRET, NEXT_PUBLIC_TURNSTILE_SITE_KEY, CRON_SECRET, SESSION_SECRET, APP_URL`
  - `parseEnv(source: Record<string, string | undefined>): Env` (throws `ZodError` listing missing keys)
  - `MAX_SEATS_PER_BOOKING = 6`, `HOLD_MINUTES = 10`, `CHECKOUT_TIMEOUT_S = 480`
  - `class AppError extends Error { code: string; status: number }`, `jsonError(e: unknown): Response`

- [ ] **Step 1: Scaffold**

Run: `npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm`
then `npm i drizzle-orm pg zod razorpay resend qrcode @node-rs/argon2 @zxing/browser` and `npm i -D drizzle-kit @types/pg @types/qrcode vitest @playwright/test tsx dotenv`
Run `npx shadcn@latest init` with defaults.

- [ ] **Step 2: Add `docker-compose.yml`** with `postgres:16` services `db` (port 5432, db `booking`) and `db-test` (port 5433, db `booking_test`, `tmpfs` data). Add `.env.example` with every key above; `.env.test` pointing `DATABASE_URL` at port 5433. Add scripts: `"test": "vitest run"`, `"db:generate": "drizzle-kit generate"`, `"db:migrate": "drizzle-kit migrate"`, `"seed:seats": "tsx scripts/seed-seats.ts"`, `"admin:create": "tsx scripts/create-admin.ts"`.

- [ ] **Step 3: Write the failing test**

```ts
// tests/unit/env.test.ts
import { parseEnv } from "@/lib/env";
test("rejects missing secrets", () => {
  expect(() => parseEnv({})).toThrow(/RAZORPAY_KEY_SECRET/);
});
test("accepts full env", () => {
  const e = parseEnv(fullEnvFixture);
  expect(e.APP_URL).toBe("http://localhost:3000");
});
```

- [ ] **Step 4: Run** `npm test -- tests/unit/env.test.ts` → FAIL (module not found)
- [ ] **Step 5: Implement** `parseEnv` with a Zod object (all strings `min(1)`, `APP_URL` `.url()`), and `env = parseEnv(process.env)` evaluated lazily via a getter so tests can import the module without a full env. Implement `constants.ts`, `errors.ts`.
- [ ] **Step 6: Run** `npm test -- tests/unit/env.test.ts` → PASS; `docker compose up -d` → both containers healthy.
- [ ] **Step 7: Commit** `chore: scaffold Next.js app, env parsing, test DB`

---

### Task 2: Database schema and test DB helpers

**Files:**
- Create: `src/db/schema.ts`, `src/db/client.ts`, `src/db/migrations/*`, `tests/helpers/db.ts`, `tests/setup.ts`
- Test: `tests/integration/schema.test.ts`

**Interfaces:**
- Produces:
  - Drizzle tables exactly as spec §4: `tiers, seats, bookings, bookingItems, tickets, adminUsers, adminSessions, auditLog, emailOutbox, webhookEvents, rateLimits`
  - `adminSessions(id text pk, adminUserId uuid fk, expiresAt timestamptz)`; `rateLimits(key text, windowStart timestamptz, count integer, pk(key, windowStart))`
  - `db` (drizzle instance), `pool` (pg.Pool)
  - Test helpers: `resetDb(): Promise<void>` (TRUNCATE all … CASCADE), `seedVenue(opts?: { tiers?: {name:string; pricePaise:number}[]; seatsPerTier?: number }): Promise<{ tiers: Tier[]; seats: Seat[] }>` (default: Gold ₹1,500 = 150000 paise, Silver ₹800 = 80000 paise, 10 seats each)

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/schema.test.ts
test("seat label is unique", async () => {
  const { seats } = await seedVenue();
  await expect(db.insert(schema.seats).values({ ...seats[0], id: undefined }))
    .rejects.toThrow(/duplicate key/);
});
test("one ticket per seat", async () => { /* insert two tickets for same seat → duplicate key */ });
test("price must be positive", async () => { /* insert tier price 0 → check constraint */ });
```

- [ ] **Step 2: Run** `npm test -- tests/integration/schema.test.ts` → FAIL
- [ ] **Step 3: Implement** schema with pgEnums, check constraint `price_paise > 0`, unique indexes from spec, index `seats(status, held_until)`, `bookings.razorpay_order_id` unique. `tests/setup.ts` loads `.env.test`, runs migrations once (`migrate()`), and calls `resetDb()` `beforeEach`.
- [ ] **Step 4: Run** `npm run db:generate && npm test -- tests/integration/schema.test.ts` → PASS
- [ ] **Step 5: Commit** `feat(db): schema, migrations, test helpers`

---

### Task 3: Utilities and seat import

**Files:**
- Create: `src/lib/phone.ts`, `src/lib/money.ts`, `src/lib/random.ts`, `src/server/seats/importSeats.ts`, `scripts/seed-seats.ts`, `scripts/sample-venue.csv`
- Test: `tests/unit/phone.test.ts`, `tests/unit/random.test.ts`, `tests/integration/importSeats.test.ts`

**Interfaces:**
- Produces:
  - `normalizeIndianPhone(input: string): string | null` → `+91XXXXXXXXXX` or `null`
  - `formatInr(paise: number): string` → `"₹1,500.00"`
  - `randomToken(bytes = 32): string` (base64url), `publicCode(): string` (6 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`)
  - `parseVenueCsv(text: string): VenueRow[]` where `VenueRow = { section, row, number, x, y, tier }`; throws `AppError("INVALID_CSV")` with line number
  - `importSeats(rows: VenueRow[]): Promise<{ inserted: number }>` — label `${section}-${row}-${number}`; unknown tier name → error; idempotent (upsert on label, never changes status of non-available seats)

- [ ] **Step 1: Write failing tests**

```ts
// Review Focus #3
test.each([
  ["98765 43210", "+919876543210"],
  ["+91 9876543210", "+919876543210"],
  ["09876543210", "+919876543210"],
  ["919876543210", "+919876543210"],
  ["12345", null],
  ["5876543210", null], // Indian mobiles start 6-9
])("normalizeIndianPhone(%s)", (i, o) => expect(normalizeIndianPhone(i)).toBe(o));
test("randomToken is 43 chars base64url", () => expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/));
test("publicCode excludes ambiguous chars", () => expect(publicCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/));
test("parseVenueCsv reports bad line", () => expect(() => parseVenueCsv("section,row,number,x,y,tier\nA,B,x,1,1,Gold")).toThrow(/line 2/));
test("importSeats is idempotent", async () => { /* import twice → 1 row per label */ });
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement.** CSV parsing by hand (no dependency): split lines, require exact header. Script reads file path from `process.argv[2]`.
- [ ] **Step 4: Run** → PASS; `npm run seed:seats -- scripts/sample-venue.csv` against local DB prints `inserted: N`.
- [ ] **Step 5: Commit** `feat: phone/money/token utils and seat CSV import`

---

### Task 4: Seat hold service (double-booking protection)

**Files:**
- Create: `src/server/holds/schemas.ts`, `src/server/holds/createHold.ts`, `src/server/seats/listSeats.ts`
- Test: `tests/integration/createHold.test.ts`, `tests/integration/createHold.concurrency.test.ts`

**Interfaces:**
- Consumes: `db`, schema, `normalizeIndianPhone`, `publicCode`, `randomToken`, constants
- Produces:
  - `HoldInput = z.object({ seatIds: z.array(z.string().uuid()).min(1).max(6), name: z.string().trim().min(2).max(80), email: z.string().email(), phone: z.string(), turnstileToken: z.string() })` (phone refined with `normalizeIndianPhone`)
  - `createHold(input: { seatIds: string[]; name: string; email: string; phone: string }, now?: Date): Promise<{ bookingId: string; publicCode: string; accessToken: string; amountPaise: number; holdExpiresAt: Date }>`
  - Throws `AppError` codes: `INVALID_SEATS` (400; duplicates or unknown IDs), `SEATS_TAKEN` (409; `details.seatIds` = unavailable), `ACTIVE_HOLD_EXISTS` (409)
  - `listSeats(now?: Date): Promise<{ id, label, section, row, number, x, y, tierId, status: "available"|"held"|"sold"|"blocked" }[]>` — expired holds reported as `available`; also returns tiers `{ id, name, pricePaise, color }[]`

- [ ] **Step 1: Write failing tests**

```ts
test("holds 2 seats and prices from tiers", async () => {
  const { seats } = await seedVenue();
  const r = await createHold({ seatIds: [gold[0].id, silver[0].id], ...guest });
  expect(r.amountPaise).toBe(150000 + 80000);
  expect(await statusOf(gold[0].id)).toBe("held");
  expect(r.holdExpiresAt.getTime() - Date.now()).toBeCloseTo(10 * 60_000, -3);
});
test("second hold on same seat → SEATS_TAKEN, no booking row left", …);
test("group hold is all-or-nothing", async () => { /* seat B already held; hold [A,B] → SEATS_TAKEN; A still available; bookings count == 1 */ });
test("expired hold is reclaimable", async () => { /* hold with now = t; hold again with now = t+11min → succeeds */ });
// Review Focus #1
test("duplicate seat IDs → INVALID_SEATS", …);
test("unknown seat ID → INVALID_SEATS and no booking row", …);
test("blocked seat → SEATS_TAKEN", …);
test("same phone in other format with active hold → ACTIVE_HOLD_EXISTS", …);
test("listSeats reports expired hold as available", …);
```

```ts
// createHold.concurrency.test.ts
test("50 parallel holds on one seat → exactly one wins", async () => {
  const { seats } = await seedVenue();
  const results = await Promise.allSettled(
    Array.from({ length: 50 }, (_, i) => createHold({ seatIds: [seats[0].id], ...guestN(i) })));
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(r => r.status === "rejected" && r.reason.code === "SEATS_TAKEN")).toHaveLength(49);
});
test("overlapping group holds never partially succeed", async () => { /* 20 parallel holds of [s0,s1] vs [s1,s2]; every seat's booking_id matches a fulfilled hold that includes it */ });
```

(Use a pool size ≥ 20 in tests so requests are truly concurrent.)

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement `createHold`** in one `db.transaction`:
  1. Reject duplicates; check active pending booking for normalized phone/email (`status='pending' AND hold_expires_at > now`).
  2. Insert booking (`pending`, `amount_paise = 0` placeholder, `hold_expires_at = now + HOLD_MINUTES`).
  3. Conditional `UPDATE … RETURNING` from spec §5 using `now` param, not `now()`, so tests can control time.
  4. If returned count ≠ requested: query which IDs exist; throw `INVALID_SEATS` if any missing, else `SEATS_TAKEN` (transaction rollback removes booking).
  5. Join tiers, insert `booking_items` snapshots, update `amount_paise`, `seat_count`.
- [ ] **Step 4: Run** both test files → PASS (run concurrency test 3× to check for flakiness)
- [ ] **Step 5: Commit** `feat: atomic seat holds with concurrency tests`

---

### Task 5: Public seat and hold API with abuse protection

**Files:**
- Create: `src/server/security/rateLimit.ts`, `src/server/security/turnstile.ts`, `src/app/api/seats/route.ts`, `src/app/api/holds/route.ts`, `src/server/payments/gateway.ts` (interface only here; impl in Task 6)
- Test: `tests/integration/rateLimit.test.ts`, `tests/integration/api.holds.test.ts`

**Interfaces:**
- Consumes: `createHold`, `listSeats`, `HoldInput`
- Produces:
  - `rateLimit(key: string, limit: number, windowSeconds: number, now?: Date): Promise<{ ok: boolean; retryAfter: number }>` (atomic `INSERT … ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count`)
  - `verifyTurnstile(token: string, ip: string): Promise<boolean>` (test env: token `"test-pass"` → true when `TURNSTILE_SECRET=test`)
  - `interface PaymentGateway { createOrder(p: { amountPaise: number; receipt: string; notes: Record<string,string> }): Promise<{ id: string }>; fetchOrderPayments(orderId: string): Promise<{ id: string; status: "created"|"authorized"|"captured"|"failed"|"refunded"; amount: number }[]>; refund(paymentId: string, amountPaise: number): Promise<{ id: string; status: string }> }`
  - `getGateway(): PaymentGateway` / `setGatewayForTests(g)`
  - `GET /api/seats` → `{ seats, tiers }` with `Cache-Control: no-store`
  - `POST /api/holds` → `201 { bookingId, publicCode, accessToken, amountPaise, holdExpiresAt, razorpayOrderId, razorpayKeyId }`; on gateway failure the hold is released and `502 PAYMENT_UNAVAILABLE`
  - Limits: `/api/holds` 10 per IP per 10 min; IP from `x-forwarded-for` first entry

- [ ] **Step 1: Write failing tests** (call route handlers directly with `new Request(...)`; `FakeGateway` from `tests/helpers/fakes.ts` returns `order_test_<n>`):

```ts
test("rate limit allows N then blocks", …);
test("POST /api/holds creates hold and order, stores razorpay_order_id", …);
test("POST /api/holds with bad turnstile → 403 TURNSTILE_FAILED, no hold", …);
test("POST /api/holds 7 seats → 400 VALIDATION", …);
test("gateway error → 502 and seats back to available", …);
test("11th request from same IP → 429", …);
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** routes: validate → turnstile → rate limit → `createHold` → `gateway.createOrder({ amountPaise, receipt: bookingId, notes: { booking_id } })` → save order ID. On order failure call `releaseBooking(bookingId: string): Promise<void>`, defined here in `src/server/holds/releaseBooking.ts` (seats of this booking with status `held` → `available`, booking → `expired`) and reused by Task 10.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: seats and holds API with Turnstile and rate limiting`

---

### Task 6: Razorpay gateway and signature verification

**Files:**
- Create: `src/server/payments/signatures.ts`; Modify: `src/server/payments/gateway.ts` (add `RazorpayGateway`)
- Test: `tests/unit/signatures.test.ts`

**Interfaces:**
- Produces:
  - `verifyPaymentSignature(p: { orderId: string; paymentId: string; signature: string }, keySecret: string): boolean` — HMAC-SHA256 hex of `` `${orderId}|${paymentId}` ``
  - `verifyWebhookSignature(rawBody: string, signature: string, webhookSecret: string): boolean` — HMAC-SHA256 hex of raw body
  - Both use `crypto.timingSafeEqual` and return `false` (not throw) on length mismatch
  - `class RazorpayGateway implements PaymentGateway` using the `razorpay` SDK (`orders.create` with `currency: "INR"`, `orders.fetchPayments`, `payments.refund`)

- [ ] **Step 1: Write failing tests**

```ts
const secret = "test_secret";
const sig = createHmac("sha256", secret).update("order_1|pay_1").digest("hex");
test("valid payment signature", () => expect(verifyPaymentSignature({ orderId: "order_1", paymentId: "pay_1", signature: sig }, secret)).toBe(true));
test("tampered payment id", () => expect(verifyPaymentSignature({ orderId: "order_1", paymentId: "pay_2", signature: sig }, secret)).toBe(false));
test("short signature returns false", () => expect(verifyPaymentSignature({ orderId: "order_1", paymentId: "pay_1", signature: "ab" }, secret)).toBe(false));
test("webhook signature over raw body", …);
test("webhook: re-serialized JSON fails", () => { /* JSON.stringify(JSON.parse(body)) with different spacing → false */ });
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: Razorpay gateway and signature checks`

---

### Task 7: `confirmBooking` (idempotent confirmation + late-payment refund path)

**Files:**
- Create: `src/server/payments/confirmBooking.ts`, `src/server/tickets/tokens.ts`, `src/server/payments/refunds.ts`
- Test: `tests/integration/confirmBooking.test.ts`, `tests/integration/refunds.test.ts`

**Interfaces:**
- Consumes: `db`, `randomToken`, `PaymentGateway`
- Produces:
  - `confirmBooking(p: { orderId: string; paymentId: string; amountPaise: number }): Promise<"confirmed" | "already_paid" | "refund_due" | "unknown_order">`
  - `newTicketToken(): string` (= `randomToken(32)`), `qrPayload(token: string): string` → `` `RKT1:${token}` ``, `parseQrPayload(text: string): string | null`
  - `processRefunds(gateway: PaymentGateway): Promise<{ refunded: number; failed: number }>` — for `refund_due` bookings with `razorpay_payment_id`: `gateway.refund(paymentId, amountPaise)` → status `refunded`, enqueue `refund_notice` email; failures stay `refund_due`

- [ ] **Step 1: Write failing tests**

```ts
test("confirms held booking: seats sold, tickets created, outbox row", async () => {
  const b = await holdWithOrder(["s0","s1"]);
  expect(await confirmBooking({ orderId: b.orderId, paymentId: "pay_1", amountPaise: b.amountPaise })).toBe("confirmed");
  expect(await seatStatuses(b)).toEqual(["sold","sold"]);
  expect(await ticketCount(b)).toBe(2);
  expect(await outboxKinds(b)).toEqual(["tickets"]);
});
test("second call returns already_paid and creates no new tickets", …);
test("10 parallel confirms → 1 confirmed, 9 already_paid, 2 tickets", …);
test("late payment, seats untouched → confirmed", async () => { /* hold expired by time, seats still attached */ });
test("late payment, seats re-held by someone else → refund_due; other user's hold intact", …);
// Review Focus #2
test("amount mismatch → refund_due, seats released, no tickets", …);
test("unknown order → unknown_order", …);
test("processRefunds calls gateway.refund with full amount and marks refunded", …);
test("processRefunds leaves refund_due on gateway error", …);
test("parseQrPayload rejects other prefixes", …);
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** in one transaction: `SELECT … FROM bookings WHERE razorpay_order_id = $1 FOR UPDATE`; if `paid` → `already_paid`; if amount ≠ `amount_paise` → release seats, `refund_due`, store payment ID; count `seats WHERE booking_id = $b AND status = 'held'` vs `seat_count`; full match → `UPDATE seats SET status='sold'`, booking `paid`, insert tickets, insert outbox; otherwise release attached seats, `refund_due`. Applies to `pending` and `expired` bookings alike.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: idempotent booking confirmation and refunds`

---

### Task 8: Payment verify endpoint and Razorpay webhook

**Files:**
- Create: `src/app/api/payments/verify/route.ts`, `src/app/api/webhooks/razorpay/route.ts`
- Test: `tests/integration/api.payments.test.ts`, `tests/fixtures/razorpay/order.paid.json`, `payment.failed.json`

**Interfaces:**
- Consumes: `verifyPaymentSignature`, `verifyWebhookSignature`, `confirmBooking`, `getGateway`
- Produces:
  - `POST /api/payments/verify` body `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }` → `200 { status: "confirmed"|"already_paid"|"refund_due", accessToken }`; bad signature → `400 BAD_SIGNATURE`. Amount comes from `gateway.fetchOrderPayments` (captured payment matching ID), never the body.
  - `POST /api/webhooks/razorpay` → always `200` after valid signature (so Razorpay doesn't retry forever on business outcomes); invalid → `400`. Records `webhook_events` by `x-razorpay-event-id` header; duplicate → `200 {duplicate:true}` without reprocessing. Handles `order.paid` / `payment.captured` (amount from payload `payment.entity.amount`), logs `payment.failed`, `refund.processed` → booking `refunded` if `refund_due`.

- [ ] **Step 1: Write failing tests**

```ts
test("verify with valid signature confirms", …);
test("verify with forged signature → 400 and booking still pending", …);
test("webhook order.paid confirms booking", …);
test("duplicate webhook event id is ignored", …);
test("webhook with bad signature → 400, nothing recorded", …);
test("verify then webhook → one set of tickets", …);
test("payment.failed leaves booking pending", …);
```

(Fixtures are signed in-test with `RAZORPAY_WEBHOOK_SECRET` from `.env.test`.)

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement.** Webhook reads `await req.text()` for the raw body before `JSON.parse`.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: payment verify endpoint and Razorpay webhook`

---

### Task 9: Ticket email outbox and "view my booking" page

**Files:**
- Create: `src/server/email/sender.ts`, `src/server/email/templates.ts`, `src/server/email/outbox.ts`, `src/server/tickets/qr.ts`, `src/app/booking/[token]/page.tsx`, `src/app/api/booking/lookup/route.ts`
- Test: `tests/integration/outbox.test.ts`, `tests/unit/templates.test.ts`

**Interfaces:**
- Produces:
  - `interface EmailSender { send(m: { to: string; subject: string; html: string; attachments?: { filename: string; content: Buffer; contentId: string }[] }): Promise<void> }`; `ResendSender`; `getEmailSender()/setEmailSenderForTests()`
  - `qrPng(payload: string): Promise<Buffer>`
  - `ticketsEmail(b: BookingWithTickets): { subject: string; html: string }` — subject `Your tickets – <public_code>`; one `<img src="cid:ticket-<seatLabel>">` per ticket; link `${APP_URL}/booking/<access_token>`
  - `refundNoticeEmail(b): { subject; html }`
  - `processOutbox(limit = 20): Promise<{ sent: number; failed: number }>` — picks `pending` rows with `attempts < 5` using `FOR UPDATE SKIP LOCKED`; on error increments attempts, stores `last_error`; at 5 → `failed`
  - `getBookingByAccessToken(token: string)` used by the page; `POST /api/booking/lookup { publicCode, email }` → `{ accessToken }` or `404` (rate-limited 5/IP/10 min)

- [ ] **Step 1: Write failing tests**

```ts
test("processOutbox sends tickets email with one QR attachment per seat", …);
test("send failure increments attempts; 5th failure marks failed", …);
test("two concurrent processOutbox runs send each email once", …);
test("ticketsEmail contains booking link and seat labels, no QR token in text", …);
test("lookup with wrong email → 404", …);
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement.** Page renders booking status, seats, tier, and QR `<img>`s (data URLs) only when booking is `paid` or `comp`; for `pending` shows "Payment processing", for `refund_due/refunded` shows refund message.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: ticket emails via outbox and booking page`

---

### Task 10: Scheduled jobs (cleanup, reconcile, outbox) and cron routes

**Files:**
- Create: `src/server/jobs/cleanup.ts`, `src/server/jobs/reconcile.ts`, `src/app/api/cron/{cleanup,reconcile,outbox}/route.ts`, `src/server/security/cronAuth.ts`, `vercel.json`
- Test: `tests/integration/jobs.test.ts`

**Interfaces:**
- Consumes: `releaseBooking`, `confirmBooking`, `processRefunds`, `processOutbox`, `PaymentGateway`
- Produces:
  - `releaseExpiredHolds(now?: Date): Promise<{ released: number }>` — only bookings still `pending` with `hold_expires_at < now`
  - `reconcilePending(gateway: PaymentGateway, now?: Date): Promise<{ confirmed: number; checked: number }>` — `pending` or `expired` bookings with order ID, created within 24 h; first captured payment → `confirmBooking`; then `processRefunds`
  - `assertCron(req: Request): void` throws `AppError("UNAUTHORIZED", 401)`
  - `vercel.json` crons: cleanup `*/5 * * * *`, reconcile `*/3 * * * *`, outbox `* * * * *` (if the plan tier disallows per-minute, outbox also runs inline after confirm — see Step 3)

- [ ] **Step 1: Write failing tests**

```ts
test("releaseExpiredHolds frees seats and marks expired", …);
test("releaseExpiredHolds ignores paid bookings and live holds", …);
test("reconcile confirms booking whose webhook never arrived", …);
test("reconcile on expired booking whose seats were re-sold → refund issued", …);
test("cron route without secret → 401", …);
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement.** Also call `processOutbox(5)` (fire-and-forget, errors logged) at the end of the verify route and webhook so emails don't wait for cron.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: cleanup, reconcile and outbox cron jobs`

---

### Task 11: Public booking UI (seat map, checkout, Razorpay Checkout)

**Files:**
- Create: `src/components/SeatMap.tsx`, `src/components/CheckoutForm.tsx`, `src/components/TierLegend.tsx`, `src/app/page.tsx`, `src/app/booking/success/page.tsx`, `src/lib/useRazorpay.ts`
- Test: `tests/unit/SeatMap.test.tsx` (Vitest + @testing-library/react, jsdom)

**Interfaces:**
- Consumes: `GET /api/seats`, `POST /api/holds`, `POST /api/payments/verify`
- Produces:
  - `<SeatMap seats tiers selected onToggle maxSelectable={6} />` — SVG circles at `(x,y)`, fill = tier color when available, grey when held/sold/blocked; held/sold/blocked not clickable; keyboard focusable with `aria-label="<label>, <tier>, <status>"`
  - `<CheckoutForm selected tiers onSubmit />` — name/email/phone fields, Turnstile widget, total via `formatInr`, privacy notice text
  - `openRazorpayCheckout(opts: { keyId; orderId; amountPaise; name; email; phone; onSuccess(r); onDismiss() })` loads `https://checkout.razorpay.com/v1/checkout.js` once; passes `timeout: CHECKOUT_TIMEOUT_S`, `prefill`, `theme.color`
  - Page polls `/api/seats` every 5 s; shows hold countdown; on `409 SEATS_TAKEN` deselects taken seats with a message; on success navigates to `/booking/<accessToken>`

- [ ] **Step 1: Write failing tests**

```ts
test("clicking available seat selects it", …);
test("sold seat is not clickable", …);
test("7th selection is blocked with message 'Maximum 6 seats per booking'", …);
test("total shows ₹2,300.00 for one Gold + one Silver", …);
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement.** Load `frontend-design` skill guidance for visual direction before building the page. Mobile-first layout: map scrollable/zoomable (CSS transform, pinch via pointer events), sticky bottom summary bar.
- [ ] **Step 4: Run** tests → PASS; `npm run dev`, book end-to-end with Razorpay **test** keys (test card / UPI `success@razorpay`) and confirm the ticket page renders QRs.
- [ ] **Step 5: Commit** `feat: public seat map and checkout UI`

---

### Task 12: Admin authentication and role guard

**Files:**
- Create: `src/server/auth/password.ts`, `src/server/auth/session.ts`, `src/server/auth/guard.ts`, `src/app/admin/login/page.tsx`, `src/app/api/admin/login/route.ts`, `src/app/api/admin/logout/route.ts`, `src/middleware.ts`, `scripts/create-admin.ts`
- Test: `tests/integration/auth.test.ts`

**Interfaces:**
- Produces:
  - `hashPassword(p: string): Promise<string>`, `verifyPassword(hash: string, p: string): Promise<boolean>` (argon2id)
  - `createSession(adminUserId: string): Promise<string>` (id = `randomToken()`, 12 h expiry), `getSession(id: string): Promise<{ adminUserId; role; email } | null>`, `destroySession(id)`
  - Cookie `admin_session`: httpOnly, secure (prod), SameSite=Lax, path `/`
  - `requireRole(req: Request, roles: ("admin"|"scanner")[]): Promise<{ adminUserId; role }>` throws 401/403; mutations also check `Origin` header equals `APP_URL`
  - `middleware.ts`: redirect unauthenticated `/admin/*` (except login) and `/scan` to `/admin/login` (cookie presence only; real check in `requireRole`)
  - Login rate limit: 5 per email per 15 min
  - `npm run admin:create -- <email> <admin|scanner>` prompts for password

- [ ] **Step 1: Write failing tests**

```ts
test("login with correct password sets cookie", …);
test("wrong password → 401, generic message", …);
test("6th attempt → 429", …);
test("scanner calling admin API → 403", …);
test("expired session → 401", …);
test("cross-origin POST → 403", …);
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: admin auth with roles`

---

### Task 13: Gate scanner

**Files:**
- Create: `src/server/scan/scanTicket.ts`, `src/app/api/scan/route.ts`, `src/app/api/scan/search/route.ts`, `src/components/QrScanner.tsx`, `src/app/scan/page.tsx`
- Test: `tests/integration/scan.test.ts`

**Interfaces:**
- Consumes: `parseQrPayload`, `requireRole(["admin","scanner"])`
- Produces:
  - `scanTicket(p: { token: string; adminUserId: string; gate: string }): Promise<{ result: "ok"; seatLabel; tierName; firstName } | { result: "already"; checkedInAt: Date; gate: string } | { result: "invalid" }>` — conditional update from spec §7, joined to bookings with `status IN ('paid','comp')`
  - `checkInTicketById(ticketId, adminUserId, gate)` (manual), same result shape
  - `POST /api/scan { payload, gate }`; `GET /api/scan/search?q=` (booking code or phone) → tickets with status
  - Rate limit 120 scans/min per admin user
  - `<QrScanner onResult(text) />` using `@zxing/browser` back camera; page shows full-screen green/red result for 2.5 s, vibrates on red, gate name stored in localStorage (try/catch)

- [ ] **Step 1: Write failing tests**

```ts
test("first scan ok with seat and first name", …);
test("second scan → already with time and gate", …);
test("10 parallel scans → exactly one ok", …);
test("unknown token → invalid", …);
// Review Focus #5
test.each(["refund_due","refunded","expired","pending"])("ticket of %s booking → invalid", …);
test("comp booking ticket → ok", …);
test("malformed payload (no RKT1: prefix) → invalid", …);
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** → PASS; manually scan a test ticket from a phone on the local network (`npm run dev -- -H 0.0.0.0`, camera needs HTTPS → use `next dev --experimental-https`).
- [ ] **Step 5: Commit** `feat: gate scanner`

---

### Task 14: Admin dashboard, booking lookup, resend and CSV export

**Files:**
- Create: `src/server/admin/dashboard.ts`, `src/server/admin/bookings.ts`, `src/server/admin/export.ts`, `src/server/admin/audit.ts`, `src/app/admin/page.tsx`, `src/app/admin/bookings/page.tsx`, `src/app/admin/bookings/[id]/page.tsx`, `src/app/api/admin/bookings/[id]/resend/route.ts`, `src/app/api/admin/export/route.ts`
- Test: `tests/integration/admin.reports.test.ts`

**Interfaces:**
- Produces:
  - `getDashboard(now?: Date): Promise<{ tiers: { name; available; held; sold; blocked; comp }[]; revenuePaise: number; recent: BookingSummary[] }>` — held counts only live holds; revenue = sum of `paid` bookings
  - `searchBookings(q: string, limit = 50)` matches public code, email, normalized phone, name (ILIKE)
  - `resendTickets(bookingId, adminUserId)` → new outbox row + audit entry
  - `exportCsv(): Promise<string>` columns `booking_code,status,name,email,phone,seat,tier,price_inr,paid_at,checked_in_at` for `paid` and `comp`; values with commas/quotes escaped; leading `= + - @` prefixed with `'` (CSV injection)
  - `logAudit(adminUserId: string, action: string, details: object): Promise<void>`

- [ ] **Step 1: Write failing tests**

```ts
test("dashboard counts per tier and revenue", …);
test("expired hold not counted as held", …);
test("search by phone in any format", …);
test("export escapes commas and neutralizes =cmd()", …);
test("resend creates outbox row and audit entry", …);
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** (admin pages are server components calling these functions after `requireRole(["admin"])`)
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: admin dashboard, lookup, resend, export`

---

### Task 15: Admin seat blocking, comp tickets, tiers & prices, audit log view

**Files:**
- Create: `src/server/admin/seats.ts`, `src/server/admin/tiers.ts`, `src/app/admin/seats/page.tsx`, `src/app/admin/tiers/page.tsx`, `src/app/admin/audit/page.tsx`, `src/app/api/admin/seats/route.ts`, `src/app/api/admin/comp/route.ts`, `src/app/api/admin/tiers/route.ts`
- Test: `tests/integration/admin.mutations.test.ts`

**Interfaces:**
- Consumes: `SeatMap` (admin mode: all seats selectable except `held`/`sold`), `logAudit`, ticket creation from Task 7 (extract `createTicketsForBooking(tx, bookingId)` into `src/server/tickets/tokens.ts` if not already shared)
- Produces:
  - `blockSeats(seatIds, adminUserId)` — only `available` → `blocked`; returns `{ blocked: string[]; skipped: string[] }`
  - `unblockSeats(seatIds, adminUserId)` — only `blocked` → `available`
  - `issueComp(p: { seatIds; name; email; phone }, adminUserId)` — seats `available` or `blocked` → `sold`; booking `comp` with `amount_paise = 0`, items snapshot price `0`; tickets + outbox; all-or-nothing → `SEATS_TAKEN`
  - `updateTier(id, { name?; pricePaise?; color? }, adminUserId)`, `createTier(...)`, `assignSeatsToTier(seatIds, tierId, adminUserId)` — rejects any `held`/`sold` seat with `SEATS_LOCKED`
  - Every function writes an audit entry

- [ ] **Step 1: Write failing tests**

```ts
test("block available seat; held seat skipped", …);
test("blocked seat cannot be held publicly", …);
test("comp on blocked seats creates comp booking with tickets", …);
test("comp is all-or-nothing when one seat is sold", …);
test("assign tier rejects held seat", …);
// Review Focus #4
test("price change during checkout does not change that booking's amount", async () => {
  const b = await holdWithOrder([gold[0].id]);           // 150000
  await updateTier(goldTier.id, { pricePaise: 200000 }, admin.id);
  expect(await confirmBooking({ orderId: b.orderId, paymentId: "pay_x", amountPaise: 150000 })).toBe("confirmed");
  expect((await getBooking(b.bookingId)).amountPaise).toBe(150000);
  const b2 = await holdWithOrder([gold[1].id]);
  expect(b2.amountPaise).toBe(200000);
});
test("every mutation writes an audit entry", …);
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: admin seat blocking, comps, tiers, audit view`

---

### Task 16: End-to-end, load test, and launch readiness

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/booking.spec.ts`, `tests/e2e/admin.spec.ts`, `tests/load/hold.k6.js`, `docs/LAUNCH_CHECKLIST.md`, `README.md`
- Modify: `src/server/payments/gateway.ts` (env flag `PAYMENT_GATEWAY=fake` for E2E only; refuses to start if `NODE_ENV=production`)

**Interfaces:**
- Consumes: everything above
- Produces: passing E2E + load results; launch checklist

- [ ] **Step 1: Write E2E tests**

```ts
test("guest books 2 seats, pays, sees QR, gate scan green then red", …);   // fake gateway + captured email
test("two browsers race for the same seat: one succeeds, other sees 'seat just taken'", …);
test("admin blocks seat; public map shows it unavailable", …);
test("scanner role cannot open /admin", …);
```

- [ ] **Step 2: Run** `npx playwright test` → FAIL until wired, then PASS
- [ ] **Step 3: Write `hold.k6.js`**: 200 VUs for 2 min hitting `GET /api/seats` and random `POST /api/holds` (Turnstile test token); thresholds `http_req_duration{p(95)}<500`, `checks>0.99`. After the run, SQL check: `SELECT seat_id FROM booking_items bi JOIN bookings b ON b.id = bi.booking_id WHERE b.status IN ('paid','comp','pending') GROUP BY seat_id HAVING count(*) FILTER (WHERE b.status IN ('paid','comp')) > 1` returns 0 rows.
- [ ] **Step 4: Run** `k6 run tests/load/hold.k6.js` against staging → thresholds pass
- [ ] **Step 5: Write `docs/LAUNCH_CHECKLIST.md`**: Vercel project in `bom1`; managed Postgres in Mumbai with pooled URL, daily backups + PITR; run migrations; seed venue CSV and tiers; create admin + scanner users; Razorpay live keys, auto-capture, webhook URL `https://<domain>/api/webhooks/razorpay` with events `order.paid, payment.captured, payment.failed, refund.processed`; Resend domain SPF/DKIM verified; Turnstile production keys; `CRON_SECRET` set and crons visible; ₹1 live payment rehearsal end-to-end; gate scan test on venue network; print attendee CSV the day before. `README.md`: setup, scripts, env keys.
- [ ] **Step 6: Commit** `test: e2e and load tests; docs: launch checklist`

---

## Spec coverage map

| Spec section | Tasks |
|---|---|
| §4 Data model | 2 |
| §5 Seat holds | 4, 5, 10 |
| §6 Payments | 6, 7, 8, 10 |
| §7 Tickets & scanner | 7, 9, 13 |
| §8 Admin | 12, 14, 15 |
| §9 Stack | 1 |
| §10 Hosting | 16 |
| §11 Security | 5, 6, 8, 12, 14 |
| §12 Testing | 4, 7, 13, 16 |
| Seat import (§8) | 3 |
