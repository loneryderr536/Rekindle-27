# Mobile Scroll Breakdown, System Bugs & Latency Audit Report

**Target:** ONE·26 Rekindle Event Booking System  
**Report Type:** Diagnostic & Root-Cause Technical Investigation  
**Primary Focus:** Mobile Scroll Failure ("Not able to scroll down on phone / site breaking"), System Latency, and Unnecessary Assets/Code Usage  
**Date:** 2026-11-03  
**Status:** Audit Only (No code committed, no build triggered, per user instruction)

---

## 1. Why You Cannot Scroll Down on Your Phone (Root-Cause Analysis)

When testing on mobile devices (iOS Safari, Chrome for Android), the site exhibits severe scroll-locking, touch unresponsive states, or apparent "breaking". There are **4 specific technical causes** responsible for this behavior:

### Cause 1: The 6,500px Sticky Scroll-Jack Trap (`StoryIntro.tsx` & `landing.css`)
- **The Code:**
  - In [`src/app/landing.css`](file:///Users/johnny/projects/event-booking/src/app/landing.css#L199-L219):
    ```css
    #o26-story { height: calc(100vh + 6500px); }
    #o26-stage {
      position: sticky;
      top: 0;
      height: 100vh;
      overflow: hidden;
    }
    ```
- **What Happens on Your Phone:**
  - To reach the actual page content (Rekindle story text, About, Stats, Plan, FAQ, and Register button), the user must scroll through **6,500 vertical pixels**.
  - On a smartphone screen (average swipe = ~200–300px), a user must perform **20 to 30 continuous full-finger swipes** just to move past the intro animation.
  - Because `#o26-stage` is `position: sticky; top: 0; overflow: hidden;`, the screen does not physically move or show any new sections during those 25+ swipes. 
  - To any mobile user, the phone feels **completely frozen and unresponsive**, leading to the impression that the site is broken and scrolling is not working.

---

### Cause 2: Main-Thread CPU Freeze & Touch-Event Starvation
- **The Code:**
  - In [`src/components/landing/StoryIntro.tsx`](file:///Users/johnny/projects/event-booking/src/components/landing/StoryIntro.tsx#L255-L259):
    ```typescript
    if (useImg) {
      const src = img.getAttribute("src") ?? "";
      img.setAttribute("src", "");
      img.setAttribute("src", src);
    }
    ```
- **What Happens on Mobile (especially iOS Safari):**
  - Because Safari does not support transparent WebM video, `useImg` triggers and swaps in `fire.webp` (**1.36 MB animated WebP**).
  - Resetting `img.src = ""` and reassigning it inside the scroll animation loop forces Safari's rendering engine to repeatedly discard, re-fetch, decode, and decompress the 1.36 MB animated WebP on the browser main thread.
  - On mobile processors, this causes immediate **main-thread thread-lock**. When the main thread locks up, touch events (`touchstart`, `touchmove`, `touchend`) are dropped or delayed by hundreds of milliseconds, resulting in a dead touch screen where swiping does nothing.

---

### Cause 3: CSS Touch Trapping & Inertia Scroll Conflicts
- **The Code:**
  - In [`src/app/landing.css`](file:///Users/johnny/projects/event-booking/src/app/landing.css#L6-L13):
    ```css
    html:has(#o26-root) {
      scroll-behavior: smooth;
    }
    html:has(#o26-root), html:has(#o26-root) body {
      overflow-x: clip;
    }
    ```
  - Line 221:
    ```css
    html:has(#o26-root) { overscroll-behavior-y: none; }
    ```
- **What Happens on Mobile:**
  - `scroll-behavior: smooth` directly conflicts with native mobile momentum (inertia) touch scrolling. When a user drags their finger on a touchscreen, mobile operating systems apply momentum physics. Smooth-scrolling intercepts this momentum and forces step-by-step interpolation, causing severe scroll stutter and jerky jumps.
  - `overscroll-behavior-y: none;` combined with `overflow-x: clip;` and `position: sticky;` has a documented WebKit bug in iOS Safari where touch scroll events on sticky containers fail to bubble to the window scroll container, trapping the finger drag.

---

### Cause 4: Massive Graphics Overload on Mobile GPUs
At any given moment on the mobile landing stage, the phone's browser is forced to process all of the following simultaneously at 60–120 FPS:
1. **Boy Canvas Animation:** Three massive **3792 × 3792 pixel raw images** (`boy-ready.webp`, `boy-snap.webp`, `boy-blink.webp`) rendered and matrix-transformed on a `<canvas>` element.
2. **Flame Logo Canvas:** 8 flame tongues drawn row-by-row on canvas, executing over **3,200 `drawImage` canvas slice operations per frame**.
3. **Animated Background Paper:** Two separate full-screen texture layers (`texNavy` and `texCream`) transformed on every frame via `translate3d`.
4. **SVG Star Field:** A `7920 × 7080` SVG container with 46 stars pulsating via CSS keyframe animations.
5. **DOM Hierarchy Style Computations:** In [`FlameLogo.tsx`](file:///Users/johnny/projects/event-booking/src/components/landing/FlameLogo.tsx#L176-L183), `getComputedStyle(el)` is called up to 7 times up the DOM tree **every frame** across multiple mounted instances.

Mobile GPUs and memory budgets simply cannot sustain this workload, resulting in dropped frames, battery overheating, tab crashes, and frozen gesture handling.

---

## 2. Entire Inventory of Unnecessarily Used Code, Assets & Dead Weight

The following items are actively consuming disk space, network bandwidth, memory, or execution cycles without contributing to the application:

| Unnecessary Item | Location / Path | Size / Impact | Status & Remediation |
| :--- | :--- | :--- | :--- |
| **`loader.mp4`** | [`public/landing/loader.mp4`](file:///Users/johnny/projects/event-booking/public/landing/loader.mp4) | **2.45 MB** | **Completely Unused.** Zero references in the entire codebase. Safe to delete. |
| **`loader-poster.jpg`** | [`public/landing/loader-poster.jpg`](file:///Users/johnny/projects/event-booking/public/landing/loader-poster.jpg) | **95.6 KB** | **Completely Unused.** Zero references in the entire codebase. Safe to delete. |
| **Default Next.js Boilerplate SVGs** | `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` | **~42 KB** | **Completely Unused.** Leftover starter template icons. Safe to delete. |
| **3,792px Boy Canvas Source Images** | [`public/landing/boy/`](file:///Users/johnny/projects/event-booking/public/landing/boy) | **~808 KB** (3792×3792px) | **Unnecessarily Massive.** Rendering 3.8K textures on mobile screens (~390px wide) consumes ~50MB of GPU texture memory. Should be scaled down to 1080px max for mobile. |
| **Duplicate Fire Video & WebP Assets** | `public/landing/fire.webp` (1.36 MB) + `fire.webm` (802 KB) | **2.16 MB total** | **Extremely Heavy.** 2MB for a 4-second flame background. Could be replaced with a compressed loop or optimized CSS particle glow. |
| **Unused `admin.css` in Root Layout** | [`src/app/layout.tsx`](file:///Users/johnny/projects/event-booking/src/app/layout.tsx#L7) | **8.5 KB** | Admin styles (`./admin/admin.css`) are loaded globally on every customer landing page view instead of being scoped to `/admin/layout.tsx`. |
| **Repeated `getComputedStyle` in RAF** | [`src/components/landing/FlameLogo.tsx`](file:///Users/johnny/projects/event-booking/src/components/landing/FlameLogo.tsx#L176) | Heavy CPU reflow | Inspecting 7 parent DOM nodes via `getComputedStyle` inside a 60fps loop is completely unnecessary. `IntersectionObserver` already handles visibility. |
| **Double Supabase Auth Check** | `proxy.ts` (middleware) + `getGuest.ts` (server component) | **200–600ms latency** | Redundant network round-trip. Calling `supabase.auth.getUser()` twice in sequence for the same request. |

---

## 3. Full System Bugs & Errors Inventory

### Bug 1: ESLint CI Failure (14,934 Problems)
- **File:** [`eslint.config.mjs`](file:///Users/johnny/projects/event-booking/eslint.config.mjs#L9-L15)
- **Problem:** `npm run lint` fails with thousands of errors because ESLint scans the `.claude/worktrees/` directory.
- **Fix:** Add `".claude/**"` to `globalIgnores`.

### Bug 2: Missing Test DB Causes Vitest Crash
- **File:** [`tests/global-setup.ts`](file:///Users/johnny/projects/event-booking/tests/global-setup.ts#L9-L14)
- **Problem:** If Docker container `db-test` is down, running `npm test` throws `TypeError: code.charCodeAt is not a function` in Node v26.
- **Fix:** Ensure `docker compose up -d db-test` is running before test execution.

### Bug 3: Missing Admin Account in Local Database
- **File:** Database table `admin_users`
- **Problem:** Table currently has 0 rows. Attempting to log into `/admin/login` locally fails because no account exists.
- **Fix:** Run `npm run admin:create -- admin@rekindle.com admin`.

### Bug 4: Unbounded Network Fetch in Cloudflare Turnstile
- **File:** [`src/server/security/turnstile.ts`](file:///Users/johnny/projects/event-booking/src/server/security/turnstile.ts#L9-L13)
- **Problem:** `fetch(VERIFY_URL)` lacks a timeout signal (`AbortSignal.timeout`). If Cloudflare edge stalls, hold requests hang until platform timeout.
- **Fix:** Add `signal: AbortSignal.timeout(5000)`.

### Bug 5: Customer-Facing Unfilled Placeholders (14 Locations)
- **Files:** `src/lib/event.ts`, `src/app/dates/page.tsx`, `src/app/register/page.tsx`, `src/components/landing/Sections.tsx`, `src/components/lineup/LineupHero.tsx`.
- **Problem:** Unresolved tokens `[TIME]`, `[VENUE], [CITY]`, `[PHOTO 1-3]`, `[ANSWER]`, `[PARKING INFO]`, `[SPEAKER / MESSAGE]` are visible to visitors.

---

## 4. Latency & Performance Bottlenecks

### 4.1 Missing Database Indexes Causing Full Table Scans
1. **Guest Email Lookup:** [`listGuestBookings.ts`](file:///Users/johnny/projects/event-booking/src/server/bookings/listGuestBookings.ts#L26) executes `WHERE lower(trim(email)) = lower(trim(${email}))`. Without an index on `lower(trim(email))`, PostgreSQL executes a full table scan for every `/my-bookings` view.
2. **Relational Joins:** `booking_items.booking_id` and `tickets.booking_id` lack foreign key indexes, degrading join performance as booking numbers grow.
3. **Seat Map Sorting:** [`listSeats.ts`](file:///Users/johnny/projects/event-booking/src/server/seats/listSeats.ts#L30) runs `ORDER BY seats.section, seats.row, seats.number` on every 5s poll without a compound sorting index, forcing in-memory sorts on all 1,000 seats.

### 4.2 Landing Page Forced Dynamic Database Query
- **File:** [`src/app/page.tsx`](file:///Users/johnny/projects/event-booking/src/app/page.tsx#L9)
- **Problem:** `export const dynamic = "force-dynamic"` forces Next.js to query PostgreSQL (`countSeats()`) on every single visitor hit on `/`, preventing static CDN caching.
- **Fix:** Use `export const revalidate = 60` or Next.js `unstable_cache`.

### 4.3 High-Frequency Uncached Seat Map Polling
- **File:** [`src/components/BookingApp.tsx`](file:///Users/johnny/projects/event-booking/src/components/BookingApp.tsx#L19)
- **Problem:** Active clients poll `/api/seats` every 5 seconds. Each poll transfers all 1,000+ seat records with `Cache-Control: no-store`. 100 concurrent users generate 20 full table queries per second.

### 4.4 Inlined 640px Base64 QR Generation
- **File:** [`src/app/booking/[token]/page.tsx`](file:///Users/johnny/projects/event-booking/src/app/booking/%5Btoken%5D/page.tsx#L38-L40)
- **Problem:** Server CPU dynamically renders 640px PNG QR codes and inlines base64 strings into the HTML payload, increasing server response time and HTML size.

---

## 5. Recommended Action Plan to Fix Mobile Scrolling

When you are ready to apply fixes, here is the exact recommended approach to make mobile scrolling smooth and reliable:

```
Mobile Fix Strategy
 ├── 1. Add Mobile Breakpoint for Story Height:
 │      On screens <= 768px, reduce story height from 6500px to 1200px (or allow a "Skip to Content" button).
 ├── 2. Remove iOS Scroll-Fighting CSS:
 │      Remove 'scroll-behavior: smooth' and 'overscroll-behavior-y: none' from mobile views.
 ├── 3. Disable Heavy Canvas & WebP Refresh on Mobile:
 │      Provide a static or lightweight CSS fallback for the boy & fire on mobile viewports.
 └── 4. Delete 2.5MB of Dead Assets:
        Remove public/landing/loader.mp4 and loader-poster.jpg to cut repository bloat.
```
