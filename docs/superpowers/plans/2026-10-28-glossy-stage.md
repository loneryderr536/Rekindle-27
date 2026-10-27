# Glossy Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every page of the site sits on one dark glossy stage with slowly drifting red/amber/teal glows, content on dark glass panels, and the Rekindle logo given the ticket's glossy finish.

**Architecture:** A fixed `StageBackground` component in the root layout draws the gradient, three drifting glows and a sheen behind all pages. Colours become CSS variables in `globals.css`; `landing.css` and component classes use them so cream surfaces convert to glass by changing tokens and a small set of shared classes. The header/footer logo gets a wrapper (`LogoShine`) with the ticket's glow and masked shine.

**Tech Stack:** Next.js 16 App Router, Tailwind v4 (`@import "tailwindcss"`), plain CSS in `src/app/globals.css` and `src/app/landing.css`, GSAP (landing intro), Vitest + Testing Library, browser pane for visual checks.

**Spec:** `docs/superpowers/specs/2026-10-28-glossy-stage-design.md`

## Global Constraints

- Palette (unchanged): navy `#0B1020` with gradient `#141B33` → `#10183A` → `#0B1020`; flame `#FF4520`; marigold `#F9A90B`; teal `#0A5470` (text on cream) and `#1A8AA8` (glow, links on dark); cream `#FDFBF4`; sand `#F4EFE2`; muted on dark `#C9CCD8` / `#E6E3DA`; ticket plum `#2A1426`. Fonts Fredoka and Poppins.
- Motion: slow drifting glows, 20–30 s cycles, `transform`/`opacity` only; no cursor or scroll reaction. `prefers-reduced-motion` stops drift, sheen, logo glow and shine.
- Glass panel: `rgba(11,16,32,.55)`, backdrop blur, ~20% cream edge, soft inner top highlight, no hard shadows.
- Visual change only: no change to booking, payment or admin behaviour; keep all button and label text unchanged (e2e tests match on it).
- Out of scope: landing scroll story, burning logo and video; seat-map and ticket layouts; the "Confirm & pay" sheet stays a light panel.
- This repo's dev server only recompiles CSS after a real content change to `globals.css`; reload after editing it.
- AGENTS.md: this Next.js version differs from older ones; check `node_modules/next/dist/docs/` before using any Next API not already used in the repo.

## Review Focus

- A very tall page (booking with 6 tickets, long FAQ) must keep the fixed background covering the whole scroll, with no cream strip at the bottom or on overscroll.
- Text on glass over the brightest glow (amber centre) must stay readable: cream on glass at the glow peak.
- Autofill and focus states in inputs on dark (browsers paint autofill light yellow/white) must not make text invisible.
- The landing intro: header logo and its shine must fade in together at the end of the scroll story, and the page must not flash cream before the story starts.
- Users with reduced motion must get a still, complete stage and a still logo (no blank areas where an animation would have filled).

---

### Task 1: Palette variables and the stage background

**Files:**
- Create: `src/components/StageBackground.tsx`
- Modify: `src/app/layout.tsx`, `src/app/globals.css`, `src/app/landing.css`, `src/components/landing/BrandPage.tsx`
- Test: `tests/unit/StageBackground.test.tsx`

**Interfaces:**
- Produces: `StageBackground(): JSX.Element` — server-safe, renders `<div aria-hidden="true" data-testid="stage-background" className="o26-stage">` containing three `.o26-glow` children (`.o26-glow-flame`, `.o26-glow-teal`, `.o26-glow-amber`) and one `.o26-sheen`.
- Produces: CSS variables on `:root`: `--stage-navy-1: #141b33`, `--stage-navy-2: #10183a`, `--stage-navy-3: #0b1020`, `--cream: #fdfbf4`, `--sand: #f4efe2`, `--muted-dark: #c9ccd8`, `--teal-bright: #1a8aa8`, `--glass: rgba(11,16,32,.55)`, `--glass-edge: rgba(253,251,244,.2)`.
- Produces: BrandPage no longer takes a `dark` prop; every BrandPage is dark.

- [ ] **Step 1: Write the failing test** in `tests/unit/StageBackground.test.tsx` (jsdom): renders `<StageBackground />`; asserts `getByTestId("stage-background")` has `aria-hidden="true"`, contains exactly 3 `.o26-glow` elements and 1 `.o26-sheen`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/StageBackground.test.tsx` — expect FAIL (module missing).
- [ ] **Step 3: Implement `StageBackground`** in `src/components/StageBackground.tsx`, and render it as the first child of `<body>` in `src/app/layout.tsx`.
- [ ] **Step 4: Add the CSS** to `globals.css`: variables above; `.o26-stage { position: fixed; inset: 0; z-index: -1; overflow: hidden; background: linear-gradient(180deg, var(--stage-navy-1) 0%, var(--stage-navy-2) 30%, var(--stage-navy-3) 100%); }`; glows as blurred radial-gradient circles (flame left `rgba(255,69,32,.5)`, teal right `rgba(26,138,168,.55)`, amber centre `rgba(249,169,11,.35)`) animated by `transform`/`opacity` keyframes of 22 s, 28 s and 25 s (`ease-in-out infinite alternate`); `.o26-sheen` a faint diagonal highlight band crossing every 40 s; all animations off under `prefers-reduced-motion: reduce`. Set `body { background: var(--stage-navy-3); color: var(--cream); }`.
- [ ] **Step 5: Remove the per-page backgrounds**: delete the `#o26-root.o26-dark-seats` and `#o26-root.o26-dark-ticket` background rules and the `bg #fdfbf4` / `color #0b1020` on `#o26-root` in `landing.css` (make it `background: transparent; color: var(--cream)`); drop the `dark` prop from `BrandPage` and its callers (`register/seats/page.tsx`, `booking/[token]/page.tsx`); keep the ticket page's plum tint as a `radial-gradient` on the ticket section only.
- [ ] **Step 6: Verify** `npx vitest run tests/unit/StageBackground.test.tsx` passes, `npx tsc --noEmit` and `npx eslint src` are clean, and in the browser `/register/seats` and `/booking/<token>` look unchanged.
- [ ] **Step 7: Commit** `feat: shared glossy stage background`

### Task 2: Glass panels, inputs, buttons, links

**Files:**
- Modify: `src/app/globals.css`, `src/app/landing.css`
- Test: `tests/unit/SeatMap.test.tsx` (existing, must still pass); visual check

**Interfaces:**
- Consumes: variables from Task 1.
- Produces: shared classes `.o26-card` (glass), `.field input/select/textarea` (dark translucent, cream border, marigold focus), `.btn-ghost` (cream outline), links on dark use `--teal-bright`; `.o26-dark`-scoped overrides from earlier work become global and the `.o26-dark` selectors are removed (except `.sheet`, which keeps its own light colours).

- [ ] **Step 1: Convert** `.o26-card`, `.field` inputs, `.btn-ghost`, `.ticket-stub`, `.o26-stepper`, `a` link colour and the `.text-muted` utility override to the glass/dark values from Global Constraints; remove `.o26-dark` prefixes. Add `input:-webkit-autofill` rules that keep cream text and a dark box-shadow fill.
- [ ] **Step 2: Keep `.sheet`** (Confirm & pay) light: its own `color: var(--ink)`, white background, original muted and ghost button colours.
- [ ] **Step 3: Verify** unit tests pass; in the browser, open `/register` and the Confirm & pay sheet at phone width: form fields readable, autofill readable, sheet unchanged.
- [ ] **Step 4: Commit** `feat: glass panels and dark form controls`

### Task 3: Landing page sections and FAQ

**Files:**
- Modify: `src/app/landing.css`, `src/components/landing/Sections.tsx`, `src/components/landing/Stats.tsx` (class names only if a hard-coded colour lives in the TSX)

**Interfaces:**
- Consumes: variables and `.o26-card` glass from Tasks 1–2.

- [ ] **Step 1: Replace** the cream surfaces in `landing.css` (`#rekindle`, `#faq`, `#faq details`, step/stat/plan cards at the lines using `#fdfbf4`, `#f4efe2`, `#fff`) with transparent or glass backgrounds and cream/muted text via variables; keep `#faq`'s `border-radius: 48px 48px 0 0`.
- [ ] **Step 2: Make** headings, leads (`.o26-lead`, `.o26-h*`), eyebrows and references readable on dark; teal text becomes `--teal-bright`.
- [ ] **Step 3: Verify** in the browser: scroll the whole landing page at phone and desktop width, confirm the intro still plays, the header fades in, no cream block remains, and the footer blends in.
- [ ] **Step 4: Commit** `feat: landing sections on the glossy stage`

### Task 4: Register, find booking, scan and admin

**Files:**
- Modify: `src/app/globals.css`; class names in `src/components/BookingsTable.tsx`, `src/components/AdminSeats.tsx`, `src/components/TiersAdmin.tsx`, `src/components/ScanStation.tsx`, `src/app/admin/layout.tsx` only where a hard-coded white/cream background or dark text colour blocks the dark theme

- [ ] **Step 1: Convert** admin and scan surfaces (`bg-white`, `border-line`, table rows, selects) to glass with high-contrast cream text; admin tables keep solid-enough backgrounds (`rgba(11,16,32,.7)`) for legibility.
- [ ] **Step 2: Verify** in the browser: `/register`, `/booking/find`, `/admin/login`, `/admin`, `/admin/seats`, `/scan` — every label, table and button readable; seat selection in admin still works.
- [ ] **Step 3: Run** `npx vitest run tests/unit` and `npx eslint src`.
- [ ] **Step 4: Commit** `feat: stage styling for forms, admin and scan`

### Task 5: Glossy logo

**Files:**
- Create: `src/components/landing/LogoShine.tsx`
- Modify: `src/components/landing/LandingHeader.tsx`, footer logo in `src/components/landing/Sections.tsx` (if present), `src/components/landing/StoryIntro.tsx` (target of the header-logo fade), `src/app/globals.css`
- Test: `tests/unit/LogoShine.test.tsx`

**Interfaces:**
- Produces: `LogoShine({ id, className, src, width, height, alt }: { id?: string; className?: string; src: string; width: number; height: number; alt: string }): JSX.Element` — a wrapper `<span id={id} className="o26-logo-shine …">` containing the `next/image` logo and an `aria-hidden` overlay masked to `src` with the ticket's top highlight and a `.lg-shine` sweep. The wrapper carries `id` so the intro can fade it as one unit.
- Consumes: `.lg-glow`, `.lg-shine`, `lgShine`, `lgGlow` keyframes already in `globals.css`.

- [ ] **Step 1: Write the failing test**: renders `<LogoShine id="o26-hlogo" src="/landing/logo.png" width={360} height={410} alt="ONE·26 Rekindle" />`; asserts the wrapper has `id="o26-hlogo"`, the image has the alt text, and the overlay is `aria-hidden="true"` and contains one `.lg-shine`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/LogoShine.test.tsx` — expect FAIL.
- [ ] **Step 3: Implement `LogoShine`**; use it in `LandingHeader` in place of the bare `Image` (keep the 60px height rule on the wrapper's image). In `StoryIntro.tsx` the GSAP targets `#o26-hlogo` keep working because the id moved to the wrapper; confirm no other selector relies on the id being on the `img`.
- [ ] **Step 4: Reduced motion**: the existing `@media (prefers-reduced-motion: reduce)` block already disables `.lg-glow`/`.lg-shine`; confirm the logo is fully visible with both off.
- [ ] **Step 5: Verify** `npx vitest run tests/unit/LogoShine.test.tsx` passes; in the browser the landing intro ends with the header logo fading in with its shine, and other pages show the glossy header logo.
- [ ] **Step 6: Commit** `feat: glossy header logo`

### Task 6: Whole-site verification

- [ ] **Step 1: Run** `npx tsc --noEmit`, `npx eslint src`, `npx vitest run tests/unit` — all clean/passing.
- [ ] **Step 2: Browser sweep** at 430px and 1440px: `/`, `/register`, `/register/seats`, a 1-ticket and a 6-ticket booking, `/booking/find`, `/admin/login`. Check: no cream strip on overscroll or at page bottom (Review Focus 1), text on glass over the amber glow (2), autofilled input (3), landing intro (4).
- [ ] **Step 3: Reduced motion**: emulate `prefers-reduced-motion: reduce`; confirm the stage and logo are still and complete (5).
- [ ] **Step 4: Report** results; do not commit anything not already committed per task.
