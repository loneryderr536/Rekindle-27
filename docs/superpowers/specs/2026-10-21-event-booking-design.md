# Event Seat Booking Website — Design Spec

**Date:** 2026-10-21
**Status:** Approved in brainstorming, pending written-spec review
**Approach:** A — single Next.js app + PostgreSQL

---

## 1. Goal

A website for **one event** where attendees pick exact seats on a seat map, pay through Razorpay, and receive QR e-tickets that staff scan at the gate. Organizers manage tiers, prices, blocked/comp seats and bookings from an admin panel.

**Success criteria**
- No seat is ever sold twice.
- Every successful payment results in exactly one confirmed booking with tickets — or an automatic refund if the seats could not be honoured.
- Abandoned or failed payments release their seats automatically within 10 minutes.
- Each ticket QR admits exactly one person, once.
- Organizers can run the event without a developer (prices, blocks, comps, lookups, exports).

## 2. Requirements

### Stated by the organizer
| # | Requirement |
|---|---|
| R1 | Single event (not a multi-event platform) |
| R2 | Seat map; users select specific seats; each seat belongs to a priced tier |
| R3 | 1,000–2,000 users, spread over days/weeks (no single opening rush) |
| R4 | Guest checkout: name, email, phone — no accounts |
| R5 | QR e-ticket delivered after payment; staff scan at the gate |
| R6 | Razorpay payment gateway |
| R7 | No refunds / cancellations by customers |
| R8 | Multiple seats per checkout, up to a small limit |
| R9 | Venue under 1,000 seats |
| R10 | Admin: sales dashboard, booking lookup & CSV export, block/comp seats, edit tiers & prices |

### Assumptions (decided during design)
- Max seats per booking: **6** (configurable constant).
- Seat hold duration: **10 minutes**; Razorpay Checkout timeout: **8 minutes**.
- Users are mostly in India; currency INR; amounts stored in **paise** (integers).
- Tickets delivered by **email**; a "view my booking" link shows the QRs again.
- Seat layout is imported once from a CSV — no visual layout editor.

### Out of scope (YAGNI)
Multi-event support, user accounts, customer cancellations/refunds, Redis, waiting room/queue, offline scanner mode, visual venue editor, WhatsApp delivery, multi-currency.

## 3. Architecture

One Next.js (App Router, TypeScript) application serves:
- **Public pages** (React): seat map, checkout, booking confirmation, "view my booking".
- **API route handlers**: holds, Razorpay order creation, payment verification, Razorpay webhook, ticket lookup, scan.
- **Admin pages**: `/admin/*` (role `admin`) and `/scan` (role `admin` or `scanner`).
- **Scheduled jobs** (cron-triggered route handlers): payment reconciliation and hold cleanup.

External services: PostgreSQL (managed), Razorpay, transactional email (Resend or Amazon SES), Cloudflare Turnstile.

```
Browser ──► Next.js (pages + API) ──► PostgreSQL
              │        ▲
              │        └── Razorpay webhook (server→server, signed)
              ├──► Razorpay Orders/Payments/Refunds API
              ├──► Email provider (tickets)
              └──► Turnstile verify
Cron ──► /api/cron/reconcile, /api/cron/cleanup
```

### Why not a separate React SPA or Redis
- A separate Vite SPA + API-only Next.js doubles deploys and adds CORS with no benefit for one team and one site.
- Redis seat locks help when tens of thousands of users hit the same seats in the same minute. At <1,000 seats and spread-out traffic, PostgreSQL alone guarantees correctness, and a second source of truth for seat state would add a class of sync bugs. Redis can be added later if the event grows to stadium scale with a timed rush.

## 4. Data model

All money in **paise** (integer). All timestamps `timestamptz`.

### `tiers`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| name | text unique | e.g. Platinum |
| price_paise | integer > 0 | current price for new bookings |
| color | text | hex, used on seat map |
| sort_order | integer | |

### `seats`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| label | text unique | e.g. `A-B-14` (section-row-number) |
| section, row | text | |
| number | integer | |
| x, y | numeric | position on SVG map |
| tier_id | uuid fk → tiers | |
| status | enum `available` \| `held` \| `sold` \| `blocked` | |
| booking_id | uuid fk → bookings, nullable | set when held/sold/comp |
| held_until | timestamptz, nullable | only meaningful when `held` |
| version | integer | bumped on change (optional optimistic checks) |

Index: `(status, held_until)`.

### `bookings`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| public_code | text unique | short human code, e.g. `RK7Q2M` |
| access_token | text unique | random; used in "view my booking" link |
| name, email, phone | text | guest details |
| status | enum `pending` \| `paid` \| `expired` \| `comp` \| `refund_due` \| `refunded` | |
| amount_paise | integer | snapshot at creation |
| seat_count | integer | |
| razorpay_order_id | text unique, nullable | |
| razorpay_payment_id | text unique, nullable | |
| hold_expires_at | timestamptz | |
| paid_at | timestamptz, nullable | |
| created_at | timestamptz | |

### `booking_items`
One row per seat in a booking (price snapshot).
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| booking_id | uuid fk | |
| seat_id | uuid fk | |
| tier_name | text | snapshot |
| price_paise | integer | snapshot |

### `tickets`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| booking_id | uuid fk | |
| seat_id | uuid fk unique | one ticket per seat |
| token | text unique | ≥128-bit random, base64url; the only QR content |
| checked_in_at | timestamptz, nullable | |
| checked_in_by | uuid fk → admin_users, nullable | |
| gate | text, nullable | |

### `admin_users`
id, email unique, password_hash (argon2id), role enum `admin` \| `scanner`, created_at.

### `audit_log`
id, admin_user_id, action text, details jsonb, created_at.

### `email_outbox`
id, booking_id, kind (`tickets` \| `refund_notice`), status (`pending` \| `sent` \| `failed`), attempts, last_error, created_at, sent_at.

### `webhook_events`
id, razorpay_event_id unique, event_type, payload jsonb, received_at — makes webhook processing idempotent and auditable.

## 5. Seat hold flow (double-booking protection)

**Create hold** (`POST /api/holds`, body: seat IDs + guest details + Turnstile token):
1. Validate input (Zod): 1–6 unique seat IDs, valid email & Indian phone.
2. Verify Turnstile token; enforce rate limits and "one active pending booking per phone/email/IP".
3. In one transaction:
   1. Insert `bookings` row (`pending`, `hold_expires_at = now() + 10 min`).
   2. Run a single conditional update:
      ```sql
      UPDATE seats
         SET status = 'held', booking_id = $booking, held_until = now() + interval '10 minutes'
       WHERE id = ANY($seat_ids)
         AND (status = 'available'
              OR (status = 'held' AND held_until < now()))
      RETURNING id, tier_id;
      ```
   3. If returned row count ≠ requested count → **rollback**, respond `409 SEATS_TAKEN` with the list of unavailable seats.
   4. Insert `booking_items` with tier name and price snapshots; compute `amount_paise` server-side; update booking.
4. Return booking ID to the client.

**Properties**
- Postgres row locks make the conditional update atomic per row; concurrent requests for the same seat — exactly one wins.
- All-or-nothing for group bookings.
- An expired hold is reclaimable immediately by the `held_until < now()` condition; the cleanup job is housekeeping only.
- `blocked` and `sold` seats are never matched.

**Release on expiry** (cleanup cron, every 5 min): set `seats` back to `available` where `status='held' AND held_until < now()` and the booking is still `pending`; mark those bookings `expired`.

**Seat map freshness:** `GET /api/seats` returns id, status (held-and-expired reported as `available`), tier; the client polls every 5 s while the map is open.

## 6. Payment flow (Razorpay)

### Happy path
1. After hold succeeds, server creates a Razorpay **Order** (`amount = amount_paise`, `currency = INR`, `receipt = booking.id`, `notes.booking_id`), stores `razorpay_order_id`. Amount is never accepted from the browser.
2. Client opens Razorpay Checkout with the order ID and `timeout: 480` (8 min).
3. On Checkout success the client posts `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature` to `POST /api/payments/verify`. Server verifies `HMAC_SHA256(order_id + "|" + payment_id, key_secret)` with constant-time compare.
4. Razorpay independently calls `POST /api/webhooks/razorpay` (`order.paid`, `payment.captured`, `payment.failed`). Server verifies `X-Razorpay-Signature` over the raw body with the webhook secret, then records the event in `webhook_events` (duplicate event IDs ignored).
5. Both paths call the same **`confirmBooking(orderId, paymentId)`**, which in one transaction:
   - Locks the booking row (`SELECT … FOR UPDATE`). If already `paid`, return (idempotent).
   - Verifies the seats are still attached to this booking (`seats.booking_id = booking.id AND status = 'held'`) — regardless of whether `held_until` has passed.
   - If all seats are still attached: set seats `sold`, booking `paid` (+ payment ID, `paid_at`), create one `tickets` row per seat, insert `email_outbox` row (`tickets`).
   - If any seat was taken by someone else: release any seats still attached, set booking `refund_due`, and enqueue the automatic refund.
6. The email worker sends tickets (QR images inline + "view my booking" link) and retries failures with backoff.

### Failure handling
| Situation | Behaviour |
|---|---|
| Payment fails | Booking stays `pending`; user may retry within the hold window |
| User abandons checkout | Hold expires; cleanup marks booking `expired`; seats available |
| Paid after hold expiry, seats untouched | Confirmed normally (seats still attached to booking) |
| Paid after hold expiry, seats re-sold | `refund_due` → Razorpay Refund API full refund → `refunded`; apology email |
| Webhook missed / endpoint down | Reconcile cron (every 3 min) fetches Razorpay order/payments for `pending` bookings created in the last 24 h and calls `confirmBooking` for paid ones; also retries `refund_due` |
| Forged success request | Signature check fails → 400, nothing changes |
| Duplicate webhook / verify + webhook race | Booking row lock + status check → second call is a no-op |

Razorpay settings: automatic capture on; webhooks for `order.paid`, `payment.captured`, `payment.failed`, `refund.processed`; webhook secret configured; test keys until launch.

## 7. Tickets and gate scanner

- Ticket token: 32 random bytes, base64url. The QR encodes only the token (optionally prefixed, e.g. `RKT1:<token>`). No personal data in the QR.
- Email contains one QR per seat plus the seat label and tier; "view my booking" page at `/booking/<access_token>` renders the same QRs.
- `/scan`: staff-only page using the phone camera (browser QR library). On scan, `POST /api/scan` with the token and gate name:
  ```sql
  UPDATE tickets SET checked_in_at = now(), checked_in_by = $admin, gate = $gate
   WHERE token = $token AND checked_in_at IS NULL
  RETURNING …;
  ```
  - Row returned → **green**: tier, seat, attendee first name.
  - No row but token exists → **red**: "Already scanned at <time>, <gate>".
  - Token unknown → **red**: "Invalid ticket".
  - Only tickets of `paid` or `comp` bookings are valid.
- Manual check-in: search by booking code or phone, check in individual tickets.
- Fallback: CSV attendee export printed before the event; gates use mobile data.

## 8. Admin panel

Login with email + password (argon2id hash), secure http-only session cookie. Roles: `admin` (everything), `scanner` (`/scan` only). Admin users created by a CLI seed script.

| Feature | Details |
|---|---|
| Dashboard | Per-tier counts of available / held / sold / blocked / comp; total revenue (paid bookings); recent bookings |
| Booking lookup | Search by name, email, phone, booking code; view booking, tickets & check-in state; resend ticket email |
| CSV export | All paid + comp bookings with seats, tier, price, check-in status |
| Block seats | Select seats on admin seat map → `blocked` (only from `available`) / unblock back to `available` |
| Comp tickets | Select seats (available or blocked) + guest details → `comp` booking, seats `sold`, tickets emailed |
| Tiers & prices | Rename tiers, change price (affects new bookings only), reassign selected seats to another tier (not allowed for `held`/`sold` seats) |
| Audit log | Every admin mutation recorded with actor and timestamp; viewable list |

Seat layout import: `npm run seed:seats -- venue.csv` (columns: section,row,number,x,y,tier).

## 9. Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript, Node runtime for API routes |
| UI | Tailwind CSS + shadcn/ui |
| Seat map | Custom SVG React component |
| Database | PostgreSQL 16+ |
| ORM / SQL | Drizzle ORM (raw SQL for the hold/scan updates) + drizzle-kit migrations |
| Validation | Zod |
| Payments | Razorpay Node SDK + Checkout.js |
| Email | Resend (or Amazon SES) |
| QR | `qrcode` (generate), browser QR scanner library (scan) |
| Auth (admin) | Custom session table or Auth.js credentials; argon2 |
| Bot protection | Cloudflare Turnstile |
| Rate limiting | Postgres-backed fixed-window counter (no Redis) |
| Jobs | Vercel Cron (or system cron on VPS) hitting secret-protected `/api/cron/*` routes |
| Tests | Vitest (unit + integration with real Postgres via Docker), Playwright (E2E), k6 (load) |

## 10. Hosting

- **Recommended:** Vercel (functions in Mumbai `bom1` region) + managed PostgreSQL in Mumbai (Supabase or AWS RDS). Use the **pooled** connection string.
- **Alternative:** single VPS (e.g. AWS Lightsail Mumbai) with Docker Compose (Next.js + Postgres + Caddy for HTTPS) and system cron; backups become the team's responsibility.
- Environments: `local` (Docker Postgres, Razorpay test), `staging` (test keys), `production` (live keys).

## 11. Security & privacy

- Server-side pricing only; signature verification on every Razorpay callback and webhook (raw body, constant-time compare).
- Turnstile on hold creation; limits: ≤6 seats, one active pending booking per phone/email and per IP; rate limits on `/api/holds`, `/api/booking/lookup`, `/api/scan`, admin login.
- All input validated with Zod; parameterized SQL only.
- Secrets in environment variables; `.env` never committed.
- Admin sessions: http-only, secure, SameSite=Lax cookies; CSRF protection via same-site + origin check on mutations; scanner role cannot reach admin routes.
- `/api/cron/*` protected by a secret header.
- Daily automatic backups + point-in-time restore.
- Personal data limited to name, email, phone; privacy notice on checkout (India DPDP Act); attendee data retained until a set period after the event, then purged.

## 12. Testing strategy

| Level | What |
|---|---|
| Concurrency (critical) | 50 parallel hold requests for the same seat against real Postgres → exactly 1 success, 49 `SEATS_TAKEN`; overlapping group holds never partially succeed |
| Unit | Pricing totals, hold expiry, booking state transitions, signature verification, QR token format |
| Integration | `confirmBooking` idempotency (verify + webhook race, duplicate webhooks, late payment with/without seat re-sale → refund), reconcile job, scan double-scan |
| E2E (Playwright) | Select seats → Razorpay test checkout → confirmation → ticket email (captured) → scan → second scan red |
| Load (k6) | ~10× expected peak on seat map + hold endpoints; p95 < 500 ms, zero double bookings |
| Launch rehearsal | Real ₹1 live-mode payment; real gate scan on venue network |

## 13. Open items for the organizer (not blocking build)
- Final tier names, prices and venue CSV.
- Exact event name, date, venue text for emails and pages.
- Email sender domain (for DNS records: SPF/DKIM).
- Choice between Vercel + managed Postgres and VPS.
