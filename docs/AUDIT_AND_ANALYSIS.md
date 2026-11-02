# System Audit, Health Check & Feature Inventory

**Target Application:** ONE·26 Rekindle Event Booking System  
**Stack:** Next.js 16 (Turbopack, App Router), Drizzle ORM, PostgreSQL 16 (Supabase), Razorpay, Resend, Vitest, Playwright  
**Audit Date:** 2026-11-02  
**Status:** Functionally Verified (394/394 Tests Passing, Dev Server Active)

---

## 1. Executive Summary & Health Check

A comprehensive functional and technical verification of the entire application was executed across the live local server, database containers, automated test suites, and source code.

| Component | Status | Verification Result |
| :--- | :---: | :--- |
| **Next.js Dev Server** | **Working** | Running on port `3000` (PID 32427). Verified `200 OK` across all public routes (`/`, `/dates`, `/lineup`, `/register`, `/booking/find`, `/api/seats`, `/admin/login`) and proper `307` auth redirects on protected routes (`/scan`, `/my-bookings`). |
| **Build & Typecheck** | **Working** | `npm run build` compiles successfully under Turbopack in 4.3s. `npx tsc --noEmit` exits with code 0 (zero TypeScript errors). |
| **Automated Test Suite** | **Working** | **All 49 test suites and all 394 unit/integration tests pass** via Vitest (45.28s execution time). |
| **Database & Schema** | **Working** | PostgreSQL 16 active with all 12 relational tables. Dev database has 88 seats, 2 tiers, and 2 active discount codes (`REKINDLE10`, `REKINDLE20`). |
| **Code Linting (`npm run lint`)** | **Failing** | Linter traverses nested `.claude/worktrees/` directory, outputting 14,934 false errors. (`npx eslint src/` passes with 0 errors). |
| **Admin Database Access** | **Blocked** | `admin_users` table has 0 rows in the local database. Visiting `/admin` cannot be authenticated until an admin user is seeded. |
| **Production Secrets & Keys** | **Incomplete** | Configured in development test mode: Razorpay test keys (`rzp_test_...`), dummy Resend API key (`test`), mock Turnstile secret (`test`). |
| **Customer-Facing Content** | **Incomplete** | 14 placeholder tokens (`[TIME]`, `[VENUE]`, `[PHOTO 1-3]`, `[ANSWER]`, `[PARKING INFO]`) remain active in UI pages. |

---

## 2. "What ALL Are There" (Complete Inventory of Working Features)

### 2.1 Customer Booking & Ticketing Flow
- **Guest Authentication (`/register`, `/sign-in`):**
  - Passwordless 6-digit email OTP and Google OAuth via Supabase SSR.
  - Persistent cookie session management with automatic refresh in Next.js middleware.
  - Test mode / fake guest seam (`GUEST_AUTH=fake`) enabling automated end-to-end testing without external network dependencies.
- **Attendee Form (`AttendeeForm.tsx`):**
  - Participant headcount selector (1–10 seats).
  - Indian mobile phone number normalization and validation (+91 format).
  - Synchronized browser state using external store (`attendeeStore`).
- **Interactive Theatre Seat Map (`SeatMap.tsx`):**
  - Dynamic coordinate layout engine (`buildRows`) that calculates rows, front-to-back sorting, and physical aisle breaks.
  - Multi-seat selection strictly locked to the attendee headcount.
  - Live seat status indicator (available, held, sold, blocked) with tier pricing badges.
  - Automatic background polling every 5,000ms to synchronize live availability.
- **Concurrency & Reservation Hold Engine (`createHold.ts`):**
  - 10-minute temporary seat hold reservation backed by PostgreSQL row-level locks (`SELECT ... FOR UPDATE`).
  - Strict concurrency protection preventing race conditions and double-booking.
  - Client-side synchronized countdown clock adjusted for server clock drift (`clockOffsetMs`).
- **Promotional Discounts Engine:**
  - Real-time discount validation endpoint (`/api/discount/validate`).
  - Percent deduction capped between 1% and 99% with subtotal and balance calculation.
- **Payment Processing (`RazorpayCheckout.tsx`):**
  - Razorpay order creation via server API (`/api/holds`).
  - Seamless Razorpay checkout modal with prefilled customer name, email, and phone.
  - HMAC-SHA256 cryptographic signature verification on payment confirmation (`/api/payments/verify`).
  - Idempotent webhook receiver (`/api/webhooks/razorpay`) handling `order.paid`, `payment.captured`, `payment.failed`, and `refund.processed`.
- **Digital Ticket Interface (`/booking/[token]`):**
  - Interactive 3D rotational carousel ring (`TicketRing`) with smooth touch gestures, drag handling, and keyboard arrow controls.
  - Individual cryptographic access token per ticket.
  - Dedicated QR code generator and one-click high-resolution PNG QR download button.
  - Live auto-refresh polling for bookings awaiting bank payment confirmation.
- **Self-Service Customer Portals:**
  - `/my-bookings`: Authenticated customer dashboard displaying active tickets, pending reservations, and expired orders.
  - `/booking/find`: Public lookup by booking code or secret access token.

### 2.2 Operations & Gate Scanning Station
- **Gate Scanner PWA (`/scan`):**
  - Mobile camera QR code scanner using `@zxing/browser`.
  - Manual search by booking code or phone number.
  - Gate selection with automatic `localStorage` persistence.
  - Real-time check-in validation preventing pass-back and ticket reuse.
  - Immediate visual flash alerts, audio chimes, and haptic vibration feedback for successful and rejected entries.

### 2.3 Administrative Management Portal
- **Role-Based Admin Access (`/admin`):**
  - Argon2-hashed password authentication with secure HTTP-only session cookies.
  - Strict role isolation between full `admin` and gate `scanner` personnel.
- **Live Financial Dashboard (`/admin`):**
  - Real-time aggregate revenue tracking (paid bookings in INR).
  - Real-time seat distribution matrix across all tiers (Available, Held, Sold, Comp, Blocked).
  - Recent transactions list with direct inspection links.
- **Bookings Manager (`/admin/bookings`):**
  - Full-text multi-criteria search (public booking code, guest email, phone, or name).
  - Detailed booking view with individual seat breakdown and check-in gate timestamps.
  - Complimentary booking generator (`/api/admin/comp`) for VIPs, staff, and press.
  - Administrative booking cancellation with automated ticket invalidation and seat release.
  - Ticket email resend trigger (`/api/admin/bookings/[id]/resend`).
- **Seat & Pricing Tier Controls:**
  - Seat manager (`/admin/seats`) to dynamically block/unblock seats or reassign tiers.
  - Tier manager (`/admin/tiers`) to adjust prices and reorder tiers.
- **Reporting & Security Logs:**
  - Full CSV export (`/api/admin/export`) for offline door lists and ticketing reports.
  - Complete administrative audit trail (`audit_log` table) recording all seat adjustments, cancellations, and comp issuances.

### 2.4 Backend Automation & Resiliency
- **Hold Cleanup Cron (`/api/cron/cleanup`):** Automatically sweeps expired holds and restores seats to "available" status.
- **Email Outbox Queue (`/api/cron/outbox`):** Asynchronous background queue delivering ticket confirmation emails via Resend with exponential backoff retry.
- **Payment Reconciliation Worker (`/api/cron/reconcile`):** Syncs with Razorpay API to automatically identify and confirm stuck or orphaned payments.
- **Bot & Rate Limiting Defense:**
  - Cloudflare Turnstile token validation on all hold requests.
  - PostgreSQL-backed sliding-window rate limiting (`rate_limits` table).

---

## 3. "What ALL Are NOT There" (Missing Features, Assets & Setup)

### 3.1 Content & Media Placeholders (Not Yet Populated)
The codebase contains placeholder tokens and mock copy that must be replaced before public launch:

- [ ] **Confirmed Venue & Hall:** [`src/lib/event.ts`](file:///Users/johnny/projects/event-booking/src/lib/event.ts#L9) has placeholder `"Venue Hall, City"`, and pages display `[VENUE], [CITY]`.
- [ ] **Official Event Timings:** Hardcoded `[TIME]` on `/dates` and `/register` instead of confirmed gate opening and start hours.
- [ ] **Artist Photography:** Lineup card back renders CSS boxes with text labels `[PHOTO 1]`, `[PHOTO 2]`, `[PHOTO 3]`; high-resolution photography of Immanuel Henry & Unarv Band is not in `public/`.
- [ ] **Artist Biographies:** Artist cards render bracketed template instructions (`[Short bio — where he leads worship...]`).
- [ ] **Artist Quotes / Blurbs:** Template copy in `BLURBS` array (`[One line about Immanuel Henry...]`).
- [ ] **Keynote / Sermon Details:** Landing page shows `[SPEAKER / MESSAGE]`.
- [ ] **FAQ Responses:** Answers for *"Is there an entry fee?"* (`[ANSWER]`) and *"Where do I park?"* (`[PARKING INFO]`) are unwritten.
- [ ] **Venue Map / Directions:** Landing page renders `<div className="o26-map">[MAP · VENUE ADDRESS]</div>` instead of an interactive Google Map or static transit visual.

### 3.2 Operational Setup Gaps
- [ ] **No Admin User in Local DB:** The `admin_users` table has 0 rows. To log in to `/admin` locally, create the initial user via:
  ```bash
  npm run admin:create -- admin@rekindle.com admin
  ```
- [ ] **Razorpay Live Configuration:** Currently configured with Razorpay test keys (`rzp_test_...`). Real payment processing requires production keys, auto-capture configuration, and production webhook secrets.
- [ ] **Resend Email Sending Domain:** `RESEND_API_KEY=test` in local environment. Live ticket delivery requires verified SPF/DKIM DNS records on the custom sending domain.
- [ ] **Production Supabase Project Setup:**
  - Auth OTP email template must be customized with the ONE·26 branding.
  - Google Cloud OAuth Web Client must be configured with authorized redirect URI `https://<project>.supabase.co/auth/v1/callback`.
  - Supabase rate limits for email sending must be raised to handle the ticket launch rush.

### 3.3 Functional Gaps (Features Not Built)
- [ ] **No Offline / Box-Office Cash POS Mode:** The system only supports online Razorpay payments and admin complimentary tickets. There is no counter sales interface for recording physical cash payments at the venue door.
- [ ] **No Downloadable PDF Ticket Passes / Tax Invoices:** Tickets are rendered as web cards with individual QR image downloads; there is no consolidated multi-page PDF pass generator or GST tax invoice generator.
- [ ] **No Visual Drag-and-Drop Seat Designer:** Venue seating layouts cannot be designed inside the browser. Layouts must be prepared as CSV files and loaded via `npm run seed:seats`.
- [ ] **No Automated Razorpay Refund Trigger via UI:** Canceling a booking in the admin panel marks it as `refund_due`. While the reconcile cron can process refunds, immediate synchronous refunds cannot be initiated directly through the admin button without Razorpay dashboard intervention.
- [ ] **No Multi-Section / Balcony Tab Switcher:** All seats render on one continuous layout grid. Large multi-tiered venues with separate floors or balconies are not segmented into tabs.

---

## 4. Technical Errors & Vulnerabilities

### 4.1 ESLint Scanning `.claude/worktrees/` (14,934 Problems)
- **Status:** Failing during `npm run lint`
- **Location:** [`eslint.config.mjs`](file:///Users/johnny/projects/event-booking/eslint.config.mjs#L9-L15)
- **Root Cause:** ESLint 9 `globalIgnores` only ignores `.next/**` relative to root. Nested Claude worktrees contain generated build chunks which ESLint parses. Direct `npx eslint src/` passes cleanly.
- **Fix:** Add `".claude/**"` to `globalIgnores` in `eslint.config.mjs`:
  ```javascript
  globalIgnores([
    ".next/**",
    ".claude/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ])
  ```

### 4.2 Vitest Startup Crash When Docker Container Is Down
- **Status:** Resolved when Docker is active, but vulnerable to crashes
- **Location:** [`tests/global-setup.ts`](file:///Users/johnny/projects/event-booking/tests/global-setup.ts#L9-L14)
- **Root Cause:** Vitest depends on PostgreSQL port `5433` (`event-booking-db-test-1`). If Docker is down, Node v26 triggers an unhandled `TypeError` inside Vite's source map runner.
- **Fix:** Keep `db-test` running via `docker compose up -d db-test`.

### 4.3 Unbounded External Fetch in Cloudflare Turnstile
- **Status:** Vulnerability to serverless timeout
- **Location:** [`src/server/security/turnstile.ts`](file:///Users/johnny/projects/event-booking/src/server/security/turnstile.ts#L9-L13)
- **Root Cause:** `fetch(VERIFY_URL, ...)` has no timeout signal. If Cloudflare hangs during a traffic surge, serverless lambdas will stall until timeout, exhausting connection pools.
- **Fix:** Add `signal: AbortSignal.timeout(5000)` to the fetch call.

---

## 5. Latency & Performance Bottlenecks

### 5.1 Main-Thread Layout Thrashing in `StoryIntro.tsx`
- **Severity:** High (Client GPU / Main Thread)
- **Location:** [`src/components/landing/StoryIntro.tsx`](file:///Users/johnny/projects/event-booking/src/components/landing/StoryIntro.tsx#L210-L213)
- **Issue:** Reading `stage.clientWidth` and `clientHeight` inside `requestAnimationFrame` on **every single frame** (60–120Hz) forces layout recalculation (forced reflow). Furthermore, the RAF loop continues running even when the user has scrolled past the hero section.
- **Fix:** Use a `ResizeObserver` for dimensions and an `IntersectionObserver` to pause the RAF loop when off-screen.

### 5.2 Synchronous Style Computation in `FlameLogo.tsx`
- **Severity:** Medium (Main Thread)
- **Location:** [`src/components/landing/FlameLogo.tsx`](file:///Users/johnny/projects/event-booking/src/components/landing/FlameLogo.tsx#L176-L191)
- **Issue:** The animation loop calls `getComputedStyle(el)` up to 7 levels up the DOM tree every frame, alongside ~3,200 `drawImage` canvas operations per frame across multiple logo instances.
- **Fix:** Remove `getComputedStyle` inside the RAF loop; rely solely on `IntersectionObserver`.

### 5.3 Double Network Waterfall in Supabase Auth
- **Severity:** High (Time to First Byte / Latency)
- **Location:** [`src/proxy.ts`](file:///Users/johnny/projects/event-booking/src/proxy.ts#L42) $\rightarrow$ [`src/server/guestAuth/getGuest.ts`](file:///Users/johnny/projects/event-booking/src/server/guestAuth/getGuest.ts#L33)
- **Issue:** Requests to `/register`, `/register/seats`, `/my-bookings` execute `supabase.auth.getUser()` in middleware, and then **immediately call it again** in the Page Server Component, producing a 200–600ms cumulative network penalty before HTML streaming begins.
- **Fix:** Forward verified user headers (`x-user-id`, `x-user-email`) from middleware or memoize via React `cache()`.

### 5.4 Landing Page Force-Dynamic Database Query
- **Severity:** High (Scalability)
- **Location:** [`src/app/page.tsx`](file:///Users/johnny/projects/event-booking/src/app/page.tsx#L9-L28)
- **Issue:** `export const dynamic = "force-dynamic"` forces every visitor on `/` to execute `countSeats()` against PostgreSQL.
- **Fix:** Configure `export const revalidate = 60` or wrap `countSeats()` in Next.js `unstable_cache`.

### 5.5 High-Frequency Seat Map Polling (`/api/seats`)
- **Severity:** Medium
- **Location:** [`src/components/BookingApp.tsx`](file:///Users/johnny/projects/event-booking/src/components/BookingApp.tsx#L19-L45)
- **Issue:** Active clients poll `/api/seats` every 5 seconds. Each request transfers and serializes all 1,000+ seat records with `Cache-Control: no-store`.
- **Fix:** Introduce HTTP `ETag` caching or differential seat state updates.

### 5.6 Missing PostgreSQL Indexes
- **Severity:** High (Database CPU & Latency)
- **Locations:**
  1. [`listGuestBookings.ts`](file:///Users/johnny/projects/event-booking/src/server/bookings/listGuestBookings.ts#L26): Queries `WHERE lower(trim(email)) = lower(trim(${email}))` without an expression index, forcing sequential table scans.
  2. [`schema.ts`](file:///Users/johnny/projects/event-booking/src/db/schema.ts#L104): Foreign keys on `booking_items.booking_id` and `tickets.booking_id` are unindexed, slowing relational joins.
  3. [`listSeats.ts`](file:///Users/johnny/projects/event-booking/src/server/seats/listSeats.ts#L30): Queries with `ORDER BY seats.section, seats.row, seats.number` without a compound sorting index, forcing in-memory sorts on every poll.
- **Fix:** Apply the following migration:
  ```sql
  CREATE INDEX bookings_lower_email_idx ON bookings (lower(trim(email)));
  CREATE INDEX booking_items_booking_id_idx ON booking_items (booking_id);
  CREATE INDEX tickets_booking_id_idx ON tickets (booking_id);
  CREATE INDEX seats_section_row_number_idx ON seats (section, row, number);
  ```

### 5.7 Sequential Database Awaits in Admin Dashboard
- **Severity:** Medium
- **Location:** [`src/server/admin/dashboard.ts`](file:///Users/johnny/projects/event-booking/src/server/admin/dashboard.ts#L14-L36)
- **Issue:** Tiers query, revenue query, and recent bookings query run sequentially (`await` after `await`), tripling dashboard response time.
- **Fix:** Wrap queries in `Promise.all([tierQuery, revQuery, recentQuery])`.

---

## 6. Complete Unresolved Placeholders Inventory

| Category | File | Line | Current Placeholder Token | Required Replacement |
| :--- | :--- | :--- | :--- | :--- |
| **Event Config** | [`src/lib/event.ts`](file:///Users/johnny/projects/event-booking/src/lib/event.ts#L9) | 9 | `venue: "Venue Hall, City"` | Actual venue name, hall, and address |
| **Key Dates** | [`src/app/dates/page.tsx`](file:///Users/johnny/projects/event-booking/src/app/dates/page.tsx#L15-L16) | 15–16 | `day: "[DD]"`, `mon: "[MON]"` | Confirmed registration launch and close dates |
| **Key Dates** | [`src/app/dates/page.tsx`](file:///Users/johnny/projects/event-booking/src/app/dates/page.tsx#L17) | 17 | `Gates open [TIME] · Starts [TIME]` | Verified event gate and start timings |
| **Key Dates** | [`src/app/dates/page.tsx`](file:///Users/johnny/projects/event-booking/src/app/dates/page.tsx#L30-L38) | 30–38 | `[VENUE], [CITY]`, `[TIME]`, `[FREE / ₹—]` | Real venue, timings, and ticket pricing values |
| **Key Dates** | [`src/app/dates/page.tsx`](file:///Users/johnny/projects/event-booking/src/app/dates/page.tsx#L53) | 53 | `ONE·26 · [VENUE], [CITY]` | Confirmed venue badge |
| **Registration** | [`src/app/register/page.tsx`](file:///Users/johnny/projects/event-booking/src/app/register/page.tsx#L44-L53) | 44–53 | `[TIME]`, `[VENUE], [CITY]`, `[FREE / ₹—]` | Dynamic bindings to `EVENT` constants |
| **Landing Content** | [`src/components/landing/Sections.tsx`](file:///Users/johnny/projects/event-booking/src/components/landing/Sections.tsx#L36) | 36 | `[SPEAKER / MESSAGE]` | Announced speaker name and sermon theme |
| **Landing FAQ** | [`src/components/landing/Sections.tsx`](file:///Users/johnny/projects/event-booking/src/components/landing/Sections.tsx#L68) | 68 | `a: "[ANSWER]"` (Is there an entry fee?) | Clear policy statement regarding ticket pricing |
| **Landing FAQ** | [`src/components/landing/Sections.tsx`](file:///Users/johnny/projects/event-booking/src/components/landing/Sections.tsx#L70) | 70 | `a: "[PARKING INFO]"` (Where do I park?) | Parking availability and public transit directions |
| **Landing Map** | [`src/components/landing/Sections.tsx`](file:///Users/johnny/projects/event-booking/src/components/landing/Sections.tsx#L172) | 172 | `[MAP · VENUE ADDRESS]` | Embedded map, venue graphic, or location card |
| **Lineup Bios** | [`src/components/lineup/LineupHero.tsx`](file:///Users/johnny/projects/event-booking/src/components/lineup/LineupHero.tsx#L17-L23) | 17, 23 | `[Short bio — where he leads worship...]`<br/>`[Short bio — who is in the band...]` | Official artist biographies |
| **Lineup Quotes** | [`src/components/lineup/LineupHero.tsx`](file:///Users/johnny/projects/event-booking/src/components/lineup/LineupHero.tsx#L29-L30) | 29–30 | `[One line about Immanuel Henry...]`<br/>`[One line about Unarv Band...]` | One-sentence punchy highlight quotes |
| **Lineup Photos** | [`src/components/lineup/LineupHero.tsx`](file:///Users/johnny/projects/event-booking/src/components/lineup/LineupHero.tsx#L319-L322) | 319–322 | `[PHOTO 1]`, `[PHOTO 2]`, `[PHOTO 3]` | Real artist photo gallery assets |
| **Tier Price Fallback** | [`src/server/seats/importSeats.ts`](file:///Users/johnny/projects/event-booking/src/server/seats/importSeats.ts#L49) | 49 | `PLACEHOLDER_TIER_PRICE_PAISE = 100000;` | Default fallback price when CSV lacks tier data |

---

## 7. Priority Launch Checklist

```
Phase 1: Operational Blockers (Must Do First)
 ├── 1. Seed initial admin user: npm run admin:create -- <email> admin
 ├── 2. Ignore ".claude/**" in eslint.config.mjs to pass CI pipeline
 └── 3. Create missing database indexes (email lowercase, foreign keys, seat sorting)

Phase 2: Content & Branding (Pre-Announcement)
 ├── 4. Replace all [PLACEHOLDER] strings in src/lib/event.ts, dates, register, sections, lineup
 ├── 5. Add artist photographs and real venue map
 └── 6. Finalize FAQ answers (entry fees, parking, transit)

Phase 3: Production Integrations (Go-Live)
 ├── 7. Switch Razorpay keys from test to live and enable auto-capture
 ├── 8. Configure custom sending domain in Resend and set live RESEND_API_KEY
 └── 9. Configure production Supabase OTP email templates and Google Cloud OAuth credentials

Phase 4: Performance Optimizations (Scale & Polish)
 ├── 10. Cache countSeats() on the landing page (revalidate = 60)
 ├── 11. Refactor StoryIntro.tsx RAF loop to eliminate client-side layout thrashing
 ├── 12. Eliminate Supabase double-fetch waterfall between proxy and getGuest()
 └── 13. Parallelize admin dashboard queries with Promise.all()
```
