# One dark glossy stage for the whole site

## Intent

The seat-map and ticket pages now sit on a full-screen dark background with red, amber and teal glows. The owner likes it and wants the whole website to use the same background and the same concept, so every page feels like one stage. The background should feel glossy and alive (slow movement) rather than flat navy. The Rekindle logo should get the same glossy finish as the logo on the digital ticket.

**Decided with the owner**

- Scope: every page, including the cream ones (register, find booking, landing sections).
- Motion: slow drifting glows (no cursor or scroll reaction).
- Content: forms and boxes become dark glass panels (no cream cards).
- The logo gets the ticket's glossy treatment.

**Out of scope:** the landing page scroll story, burning logo and video; the seat-map and ticket layouts (already approved); any booking, payment or admin behaviour. Visual change only.

## Palette (existing brand tokens, unchanged)

| Role | Hex |
|---|---|
| Night navy (base) | `#0B1020`; gradient `#141B33` → `#10183A` → `#0B1020` |
| Flame red-orange | `#FF4520` |
| Marigold amber | `#F9A90B` |
| Teal | `#0A5470` (text on cream), `#1A8AA8` (glow, links on dark) |
| Cream | `#FDFBF4`; sand `#F4EFE2` |
| Muted on dark | `#C9CCD8`, `#E6E3DA` |
| Ticket plum | `#2A1426` |

Fonts: Fredoka (headings, numbers), Poppins (body).

## Design

### 1. Stage background
- A single `StageBackground` component in the root layout, behind all pages, `position: fixed`, so the glows keep drifting while people move between pages.
- Navy vertical gradient, three blurred glows (red left, teal right, amber centre) animated with `transform`/`opacity` only over 20–30 s, and one faint diagonal sheen band crossing very slowly.
- `prefers-reduced-motion`: drift and sheen stop; glows stay in place.
- Replaces the per-page `o26-dark-seats` / `o26-dark-ticket` backgrounds; the ticket page keeps a subtle plum tint behind the tickets.

### 2. Content on the stage
- Text cream `#FDFBF4`, secondary `#C9CCD8`; red-orange highlights and marigold buttons unchanged.
- White/sand boxes become dark glass: `rgba(11,16,32,.55)`, backdrop blur, thin cream edge (~20%), soft inner top highlight.
- Inputs: dark translucent, cream border, marigold on focus. Outline buttons: cream outline. Links on dark use `#1A8AA8` or cream with underline.
- Header: the dark variant on every page (landing page keeps its fade-in).
- Landing: cream sections (Rekindle, stats, line-up) and FAQ switch to glass; the FAQ keeps its rounded top edge. Scroll story untouched.
- Register and find booking: one glass panel each.
- Scan and admin: dark background and header; tables and forms stay high-contrast glass.
- Footer: translucent navy.
- The "Confirm & pay" sheet stays a light panel (it has its own colours).
- Implementation approach: replace hard-coded cream/navy values in `landing.css` and `globals.css` with shared CSS variables, so one palette controls the site.

### 3. Glossy logo
Apply the ticket logo treatment to the header logo (and the footer logo if present):
- Animated warm glow behind the art (the ticket's `lgGlow`).
- A diagonal shine sweep masked to the logo shape (`lgShine`), plus a soft top-down highlight (overlay blend).
- Reduced motion: glow and shine off.
- Risk: the landing intro (GSAP) fades `#o26-hlogo` in as the logo rises into the header. The shine layer must fade with it, so the intro should drive the opacity of a wrapper around the image and its shine layer instead of the bare image. The burning logo during the intro is not changed.

## Build order (each step leaves the site working)
1. Palette variables; swap hard-coded colours in `landing.css` / `globals.css`.
2. `StageBackground` in the root layout; remove the per-page dark backgrounds.
3. Glass panels, inputs, buttons, links.
4. Landing page sections and FAQ.
5. Register and find booking.
6. Scan and admin.
7. Glossy header/footer logo, including the wrapper change for the intro animation.

## Testing
- Browser check of every page at phone and desktop width, including the seat map, a multi-ticket booking, and the Confirm & pay sheet.
- Text contrast on glass against the brightest glow.
- Smooth on a phone-sized viewport; reduced motion stops all drift and shine.
- Landing intro still plays and the header logo still appears at the end.
- `tsc`, `eslint`, unit tests; keep button and label text unchanged so the e2e tests still match.
