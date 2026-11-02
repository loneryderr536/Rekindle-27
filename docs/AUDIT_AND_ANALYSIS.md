# System Audit & Technical Analysis Report

**Target Application:** ONE·26 Rekindle Event Booking System  
**Stack:** Next.js 16 (Turbopack, App Router), Drizzle ORM, PostgreSQL 16 (Supabase), Razorpay, Resend, Vitest, Playwright  
**Date:** 2026-11-02  

---

## Executive Summary

A comprehensive code and architecture audit was performed across three dimensions:
1. **Errors** (Configuration, runtime, testing, build, external dependencies)
2. **Latency & Performance** (Rendering, animation loops, auth waterfalls, database queries, indexing)
3. **Empty Placeholders** (Unfilled template tokens, UI mocks, placeholder images, mock configurations)

---

## 1. Errors & Build / Runtime Issues

### 1.1 ESLint Failure (14,934 Problems)
- **Status:** Failing during `npm run lint`
- **Location:** [`eslint.config.mjs`](file:///Users/johnny/projects/event-booking/eslint.config.mjs)
- **Root Cause:** Next.js and ESLint 9 `globalIgnores` only ignores `.next/**` relative to the repository root. A nested Claude worktree (`.claude/worktrees/guest-auth-my-bookings/.next/`) contains generated Turbopack build chunks which ESLint attempts to parse.
- **Verification:** Running `npx eslint src/` directly passes with **0 errors and 0 warnings**.
- **Remediation:**
  Update [`eslint.config.mjs`](file:///Users/johnny/projects/event-booking/eslint.config.mjs#L9-L15) to ignore `.claude/**`:
  ```javascript
  globalIgnores([
    ".next/**",
    ".claude/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ])
  ```

### 1.2 Vitest Test Runner Startup Failure (`TypeError: code.charCodeAt is not a function`)
- **Status:** Failing during `npm test`
- **Location:** [`tests/global-setup.ts`](file:///Users/johnny/projects/event-booking/tests/global-setup.ts#L9-L14)
- **Root Cause:**
  1. The test database container `db-test` (port `5433` defined in `docker-compose.yml`) was offline.
  2. When `global-setup.ts` fails to connect to Postgres, Node.js v26.8.1 attempts to print the error stacktrace. Vite 6's module-runner (`extractInlineSourceMap`) encounters an unexpected CallSite structure in Node 26 and throws a secondary `TypeError`.
- **Remediation:**
  Ensure the test container is started before executing tests:
  ```bash
  docker compose up -d db-test
  npm test
  ```

### 1.3 Unbounded External API Requests (No AbortSignal/Timeout)
- **Status:** Vulnerability to connection stalls
- **Location:** [`src/server/security/turnstile.ts`](file:///Users/johnny/projects/event-booking/src/server/security/turnstile.ts#L9-L13)
- **Root Cause:** `fetch(VERIFY_URL, ...)` does not configure an abort timeout. In the event of network disruption or Cloudflare edge latency during high-load drops, serverless execution slots will block until host timeout, exhausting database pools.
- **Remediation:**
  Add `signal: AbortSignal.timeout(5000)` to the fetch call:
  ```typescript
  const res = await fetch(VERIFY_URL, {
    method: "POST",
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }),
    signal: AbortSignal.timeout(5000),
  });
  ```

### 1.4 Turbopack Monorepo Boundary Warning
- **Status:** Build log warning
- **Location:** Next.js build output
- **Description:** Next.js warns that `package-lock.json` in parent directories was ignored.
- **Remediation:** Explicitly declare Turbopack root in [`next.config.ts`](file:///Users/johnny/projects/event-booking/next.config.ts) if warning suppression is desired:
  ```typescript
  turbopack: {
    root: path.resolve(import.meta.dirname),
  }
  ```

---

## 2. Latency & Performance Bottlenecks

### 2.1 Forced Layout Thrashing (Reflow) in Scroll Animation
- **Severity:** High (Client GPU / Main Thread)
- **Location:** [`src/components/landing/StoryIntro.tsx`](file:///Users/johnny/projects/event-booking/src/components/landing/StoryIntro.tsx#L210-L213)
- **Mechanism:**
  - Inside `requestAnimationFrame(loop)`:
    ```typescript
    if (`${stage.clientWidth}x${stage.clientHeight}` !== layoutKey) layout(false);
    ```
  - Accessing `stage.clientWidth` and `clientHeight` every single frame (60–120Hz) forces the browser engine to perform synchronous layout recalculation.
  - The RAF loop continues firing even when the user has scrolled past the hero section (`into > LEN + stage.clientHeight`).
- **Remediation:**
  1. Replace per-frame DOM geometry reads with a `ResizeObserver` listener.
  2. Disconnect or pause the RAF loop when the hero section leaves the viewport (using `IntersectionObserver`).

### 2.2 Synchronous Style Computation in Canvas Flame Animation
- **Severity:** Medium (Main Thread)
- **Location:** [`src/components/landing/FlameLogo.tsx`](file:///Users/johnny/projects/event-booking/src/components/landing/FlameLogo.tsx#L176-L191)
- **Mechanism:**
  - Every RAF frame, `hidden()` executes `getComputedStyle(el)` up to 7 levels up the DOM tree to verify whether the logo is hidden.
  - Multiple `FlameLogo` instances run concurrently (Landing Header, Story Scene, Footer).
  - `drawTongue()` draws slice-by-slice on canvas (~3,200 `drawImage` ops per logo frame).
- **Remediation:**
  - Use `IntersectionObserver` alone to pause the animation rather than invoking `getComputedStyle()` inside the animation loop.

### 2.3 Supabase Auth Double-Fetch Waterfall
- **Severity:** High (Time to First Byte / Latency)
- **Location:**
  - Middleware: [`src/proxy.ts`](file:///Users/johnny/projects/event-booking/src/proxy.ts#L42)
  - Server Component: [`src/server/guestAuth/getGuest.ts`](file:///Users/johnny/projects/event-booking/src/server/guestAuth/getGuest.ts#L33)
- **Mechanism:**
  1. For requests to `/register`, `/register/seats`, `/my-bookings`: `proxy.ts` performs a round-trip network call `await supabase.auth.getUser()`.
  2. Once the request reaches the Page Server Component, `getGuest()` executes a **second** identical round-trip network call `await supabase.auth.getUser()`.
  3. Total TTFB penalty: **200ms – 600ms** cumulative network overhead before HTML streaming starts.
- **Remediation:**
  Forward verified user data from the middleware via request headers (e.g. `x-user-id`, `x-user-email`) or cache the user object within React's `cache()` scope for the request.

### 2.4 Landing Page Force-Dynamic Database Query
- **Severity:** High (Scalability)
- **Location:** [`src/app/page.tsx`](file:///Users/johnny/projects/event-booking/src/app/page.tsx#L9-L28)
- **Mechanism:**
  - `export const dynamic = "force-dynamic"` forces Next.js to render the landing page server-side on every hit.
  - Line 28 invokes `await countSeats().catch(() => null)`.
  - Under surge traffic (e.g., social launch or marketing drop), thousands of visitors will hammer PostgreSQL with seat count queries.
- **Remediation:**
  Wrap `countSeats()` in Next.js `unstable_cache` with a revalidation tag (e.g., 60 seconds) or configure `export const revalidate = 60`.

### 2.5 Seat Map Polling Overhead (`/api/seats`)
- **Severity:** Medium
- **Location:** [`src/components/BookingApp.tsx`](file:///Users/johnny/projects/event-booking/src/components/BookingApp.tsx#L19-L45)
- **Mechanism:**
  - Every active booking client polls `/api/seats` every 5,000ms (`POLL_MS = 5000`).
  - Each poll queries the entire seat map (1,000+ seats, all fields, ordered by section/row/number) with `Cache-Control: no-store`.
  - 100 concurrent users = 20 database queries per second = 20,000 JSON seat records serialized per second.
- **Remediation:**
  Add conditional ETag / `If-None-Match` checks or differential updates for seat availability changes.

### 2.6 Missing Postgres Indexes & Query Performance
- **Severity:** High (Database Latency & CPU)
- **Locations & Missing Indexes:**
  1. **Guest Bookings Lookup:** [`src/server/bookings/listGuestBookings.ts`](file:///Users/johnny/projects/event-booking/src/server/bookings/listGuestBookings.ts#L26)
     - Query: `WHERE lower(trim(email)) = lower(trim(${email}))`
     - Issue: No functional index exists on `lower(trim(email))`. Postgres executes a sequential table scan on `bookings`.
     - Index needed: `CREATE INDEX bookings_lower_email_idx ON bookings (lower(trim(email)));`
  2. **Foreign Key Joins:**
     - `booking_items.booking_id` has no index.
     - `tickets.booking_id` has no index.
     - `email_outbox.booking_id` has no index.
     - Issue: In PostgreSQL, foreign key constraints do not automatically create indexes. Joining `booking_items` by `booking_id` requires full scans.
     - Index needed: `CREATE INDEX booking_items_booking_id_idx ON booking_items(booking_id);`
  3. **Seat Map Sorting:** [`src/server/seats/listSeats.ts`](file:///Users/johnny/projects/event-booking/src/server/seats/listSeats.ts#L30)
     - Query: `ORDER BY seats.section, seats.row, seats.number`
     - Issue: Only `seats_status_held_until_idx` exists. Sorting is computed in memory for each `/api/seats` request.
     - Index needed: `CREATE INDEX seats_section_row_number_idx ON seats (section, row, number);`

### 2.7 Sequential Awaits in Admin Dashboard & Tickets Loader
- **Severity:** Medium
- **Location:**
  - [`src/server/admin/dashboard.ts`](file:///Users/johnny/projects/event-booking/src/server/admin/dashboard.ts#L14-L36):
    `t = await db.execute(...)` $\rightarrow$ `rev = await db.execute(...)` $\rightarrow$ `recent = await db.execute(...)`.
    Parallelizing with `Promise.all([tierQuery, revQuery, recentQuery])` cuts dashboard loading latency by over 50%.
  - [`src/server/tickets/loadBooking.ts`](file:///Users/johnny/projects/event-booking/src/server/tickets/loadBooking.ts#L57):
    `getBookingByAccessToken` invokes 3 sequential queries (token $\rightarrow$ booking details $\rightarrow$ booking tickets) instead of a consolidated join.

### 2.8 Server-Side Base64 QR Code Generation
- **Severity:** Medium
- **Location:** [`src/app/booking/[token]/page.tsx`](file:///Users/johnny/projects/event-booking/src/app/booking/%5Btoken%5D/page.tsx#L38-L40)
- **Mechanism:**
  - `qrDataUrl(qrPayload(t.token))` generates 640px high-resolution PNG data URLs on the server CPU for every ticket on every page request.
  - Large base64 strings inflate HTML payload size sent across the network.
- **Remediation:**
  Serve ticket QR codes through a dedicated image endpoint (e.g. `/api/tickets/[token]/qr.png`) or render client-side SVG/Canvas to enable browser caching.

---

## 3. Empty Placeholders Inventory

The following unresolved placeholder values are active in customer-facing and operational files:

| Category | File | Line | Current Placeholder Content | Required Production Replacement |
| :--- | :--- | :--- | :--- | :--- |
| **Event Config** | [`src/lib/event.ts`](file:///Users/johnny/projects/event-booking/src/lib/event.ts#L9) | 9 | `venue: "Venue Hall, City"` | Exact venue name, auditorium, and city |
| **Key Dates** | [`src/app/dates/page.tsx`](file:///Users/johnny/projects/event-booking/src/app/dates/page.tsx#L15-L16) | 15–16 | `day: "[DD]"`, `mon: "[MON]"` (Registration opens & closes) | Confirmed launch and cutoff dates |
| **Key Dates** | [`src/app/dates/page.tsx`](file:///Users/johnny/projects/event-booking/src/app/dates/page.tsx#L17) | 17 | `note: "Gates open [TIME] · Starts [TIME]"` | Actual gate and event start times |
| **Key Dates** | [`src/app/dates/page.tsx`](file:///Users/johnny/projects/event-booking/src/app/dates/page.tsx#L30-L38) | 30–38 | `value: "[VENUE], [CITY]"`<br/>`value: "[TIME]"`<br/>`value: "[FREE / ₹—]"` | Real venue, timing, and ticket pricing |
| **Key Dates** | [`src/app/dates/page.tsx`](file:///Users/johnny/projects/event-booking/src/app/dates/page.tsx#L53) | 53 | `ONE·26 · [VENUE], [CITY]` | Header venue badge |
| **Registration** | [`src/app/register/page.tsx`](file:///Users/johnny/projects/event-booking/src/app/register/page.tsx#L44-L53) | 44–53 | `Tue, 26 January 2027 · [TIME]`<br/>`[VENUE], [CITY]`<br/>`Entry [FREE / ₹—]` | Dynamic binding to confirmed `EVENT` values |
| **Landing Content** | [`src/components/landing/Sections.tsx`](file:///Users/johnny/projects/event-booking/src/components/landing/Sections.tsx#L36) | 36 | `[SPEAKER / MESSAGE]` | Announced speaker name and sermon theme |
| **Landing FAQ** | [`src/components/landing/Sections.tsx`](file:///Users/johnny/projects/event-booking/src/components/landing/Sections.tsx#L68) | 68 | `a: "[ANSWER]"` (Is there an entry fee?) | Official ticketing and pricing policy |
| **Landing FAQ** | [`src/components/landing/Sections.tsx`](file:///Users/johnny/projects/event-booking/src/components/landing/Sections.tsx#L70) | 70 | `a: "[PARKING INFO]"` (Where do I park?) | Parking location and transit instructions |
| **Landing Map** | [`src/components/landing/Sections.tsx`](file:///Users/johnny/projects/event-booking/src/components/landing/Sections.tsx#L172) | 172 | `[MAP · VENUE ADDRESS]` | Interactive map, static map image, or venue card |
| **Lineup Bios** | [`src/components/lineup/LineupHero.tsx`](file:///Users/johnny/projects/event-booking/src/components/lineup/LineupHero.tsx#L17-L23) | 17, 23 | `[Short bio — where he leads worship...]`<br/>`[Short bio — who is in the band...]` | Approved artist biographies |
| **Lineup Blurbs** | [`src/components/lineup/LineupHero.tsx`](file:///Users/johnny/projects/event-booking/src/components/lineup/LineupHero.tsx#L29-L30) | 29–30 | `[One line about Immanuel Henry...]`<br/>`[One line about Unarv Band...]` | One-liner punchy quotes |
| **Lineup Photos** | [`src/components/lineup/LineupHero.tsx`](file:///Users/johnny/projects/event-booking/src/components/lineup/LineupHero.tsx#L319-L322) | 319–322 | `[PHOTO 1]`, `[PHOTO 2]`, `[PHOTO 3]` | Production photo gallery assets |
| **Seat Import** | [`src/server/seats/importSeats.ts`](file:///Users/johnny/projects/event-booking/src/server/seats/importSeats.ts#L49) | 49 | `export const PLACEHOLDER_TIER_PRICE_PAISE = 100000;` | Default fallback price when CSV lacks tier data |

---

## 4. Priority Remediation Plan

```
High Priority (Launch Blockers)
 ├── 1. Replace all UI [PLACEHOLDER] tokens in dates, register, landing, and lineup
 ├── 2. Configure ".claude/**" in eslint.config.mjs to unblock CI linting
 └── 3. Create missing Postgres indexes (lower(email), booking_items foreign key, seats order)

Medium Priority (Performance & Resilience)
 ├── 4. Add AbortSignal.timeout(5000) to Cloudflare Turnstile fetch
 ├── 5. Add ISR / caching to countSeats() on the landing page
 ├── 6. Optimize StoryIntro RAF loop to eliminate client-side layout thrashing
 └── 7. Eliminate Supabase double-fetch waterfall between proxy and getGuest()

Low Priority (Refinements)
 ├── 8. Parallelize admin dashboard queries with Promise.all()
 └── 9. Move ticket QR generation from inlined base64 to cached image endpoints
```
