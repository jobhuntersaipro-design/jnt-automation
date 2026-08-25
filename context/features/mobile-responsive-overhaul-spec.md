# Mobile Responsive Overhaul — Spec

## Status
Draft — awaiting approval. No code written.

## Method
Audited at 375×812 (iPhone X/11/12/13 mini class) via Playwright against local dev,
logged in as an approved agent. Every route was probed for: unintended horizontal
overflow, horizontally-scrolling regions, input font size (<16px = iOS zoom-on-focus),
touch-target size (<44×44 per WCAG 2.5.5 / <40 flagged), and sub-12px text.
Supplemented with a static sweep of all 82 raw `<input>` elements and every
`grid-cols-[...]` declaration.

## Audit results (measured, 375px)

| Route | Unintended h-overflow | Widest scroll region | Inputs <16px | Targets <40px |
|---|---|---|---|---|
| `/auth/login` | none | — | 2 / 2 | 7 |
| `/dashboard` | **436px** (filter bar) | 763px chart | 1 / 1 | 25 |
| `/branches` | none ✅ | — | 0 | 2 |
| `/branches/[code]` | none ✅ | — | 0 | 32 |
| `/dispatchers?tab=payroll` | none | 1152px table | 1 / 1 | 190 |
| `/dispatchers?tab=settings` | none | **1280px** row grid | 28 / 49 | 241 |
| `/staff?tab=settings` | **822px** (toolbar) | 516px table | 1 / 1 | 122 |
| `/staff?tab=payroll` | **584px** (toolbar) | **1842px** table | **274 / 274** | **389** |
| `/settings` | none | — | 6 / 6 | 17 |

`/branches` and `/branches/[code]` are clean. They already use
`grid-cols-1 sm:grid-cols-[...]` — this is the reference pattern for the rest.

---

## P0 — Blockers (site is not usable on a phone without these)

### P0.1 — App shell uses `h-screen overflow-hidden`
`src/app/(dashboard)/layout.tsx:27` — `flex flex-col h-screen overflow-hidden`, with
every page as an inner `flex-1 overflow-y-auto` scroller.

On mobile browsers `100vh` excludes the collapsible URL bar, so ~110px of viewport is
permanently unusable; the address bar never auto-collapses because the document itself
never scrolls; there is no rubber-band; and `position: fixed` drawers/toasts anchor
against the wrong box. This is the root cause of the general "feels broken" symptom.

**Change:** `h-dvh` (dynamic viewport height) rather than `h-screen`, and on mobile let
the document scroll naturally — `min-h-dvh` + `overflow-visible` below `lg`, keeping the
current fixed-shell behaviour from `lg` up where it's correct for desktop.
Verify sticky table headers and the four drawers still behave after the change.

**Files:** `src/app/(dashboard)/layout.tsx`, plus the 14 `flex-1 overflow-y-auto`
page roots listed in the audit.

### P0.2 — Every text input triggers iOS zoom-on-focus
38 of 82 raw `<input>` elements hardcode `text-sm` / `text-[0.83rem]` / `text-[0.84rem]`
(≤14px). iOS Safari force-zooms any focused field under 16px and does not zoom back out —
so tapping a single payroll cell leaves the user stranded at 1.5× zoom on a
1842px-wide table. On `/staff?tab=payroll` this is **274 of 274 inputs**.

The shared `src/components/ui/input.tsx:12` already solves this correctly with
`text-base md:text-sm`. 23 files bypass it with raw `<input>`.

**Change:** introduce one shared input class constant (or extend `ui/input.tsx` with the
compact variants these screens need) applying `text-base md:text-[0.84rem]`, and migrate
all 38 sites onto it. Font size only — no visual change on desktop.

**Files (by count):** `employee-drawer.tsx` (6), `new-dispatcher-modal.tsx` (6),
`payroll-tab.tsx` (4), `add-dispatcher-drawer.tsx` (4), `admin-client.tsx` (3),
`auth/login/page.tsx` (2), `settings-client.tsx` (2), `salary-table.tsx` (2),
+ 9 files with 1 each.

### P0.3 — Non-wrapping toolbars push controls off-screen
A repeating bug class: `flex items-center gap-N` filter rows with no `flex-wrap`.
Measured overflow, with the named control fully unreachable at 375px:

- `dashboard-filters.tsx:157` — 420px wide; **Reset button** off-screen.
- `staff/payroll-tab.tsx:965` — 568px wide; **search input** off-screen.
- `staff/employee-list.tsx:190` — 612px wide; **search input** and the
  "SHOWING 60 OF 60 EMPLOYEES" count off-screen (measured `right: 822px`).

**Change:** `flex flex-wrap gap-2` (or `flex-col sm:flex-row`), with search inputs as
`flex-1 min-w-0 sm:flex-none sm:w-52`. This is the exact pattern the 2026-04-25
"Mobile-Responsive Cleanup" applied elsewhere — these three rows were missed.

### P0.4 — Overview KPI figures are clipped mid-digit
`dashboard/summary-cards.tsx:68` renders values at a fixed `text-[2.4rem]` inside
`grid-cols-2` at 375px, on a card with `overflow-hidden`. Result: the hero reads
`RM 1,780,78…`, Avg Monthly reads `RM 5,294.5`, Total Orders reads `1,418,3`.
**The primary numbers on the landing page are unreadable.**

**Change:** `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` (line 162) and a fluid value size
— `text-[1.75rem] sm:text-[2.4rem]`, or `clamp()` — so figures shrink instead of clip.
Apply the same to `staff/payroll-summary-cards.tsx:19`, which has the identical
`grid-cols-2` + fixed-size construction and will clip the moment a month has real data.

---

## P1 — Wide tables → card layout on mobile (your chosen approach)

Two grids can never fit a phone. Below `sm`, each row becomes a stacked card with
label/value pairs; the table markup stays untouched from `sm` up.

### P1.1 — Staff Payroll (`staff/payroll-tab.tsx:1117`, `minWidth: 1810`)
The worst screen in the app: 16 columns, 274 sub-16px inputs, 389 sub-40px targets,
shortest input **17px tall**, HOUR/DAY toggle **34×14px**. Entering one employee's
payroll currently means ~5 viewports of horizontal swiping with a zoom event per field.

Card contents: avatar + name + branch + role chips as header; Pay / Hours / allowances /
statutory / Net as label-value rows; HOUR·DAY segmented control at ≥44px; per-row
Active toggle, Generate Payslip, Delete as a footer action row. Hero totals, bulk-select,
and Confirm & Save keep operating on the full filtered set exactly as today.

### P1.2 — Dispatchers Settings (`staff/dispatcher-row.tsx:159`, `min-w-[1280px]`)
15 columns, 241 sub-40px targets, checkboxes **14×14px**. Card contents: avatar + name +
ID + branch chips; IC field; weight-tier chips (tap → existing popover); incentive and
petrol blocks as labelled toggle+field groups; pin/history/delete as a footer row.

### P1.3 — Employee list (`staff/employee-list.tsx:319`) — 8 cols, 516px
Header labels currently collide into `EMPLOYEEETYPEBRANCH IC DISPATCHERDOCSSTATUS`.
Same card treatment; it is read-only so this one is cheap.

### P1.4 — Top Dispatchers (`dashboard/top-dispatchers.tsx:155`) — 8 cols, 763px
Read-only. Card or a 3-column condensed variant (name / orders / net) with the rest
behind a tap-to-expand.

---

## P2 — Touch targets & density

- **Icon buttons at 14–22px.** Password-visibility toggles are **15×15** (login,
  settings ×3), row checkboxes **14×14**, sort buttons **20–22px**, notification bell
  **32×32**, hamburger **36×36**. WCAG 2.5.5 wants 44×44.
  **Change:** keep the glyph size, expand the hit area — `p-2.5` plus
  `before:absolute before:-inset-2` on the tight ones. No visual change.
- **Sub-12px text.** `/dashboard` alone has 30 nodes under 12px (down to **10px**).
  Raise the floor to 12px on mobile for labels, 14px for body.
- **Pagination buttons** at 28×28 → 40×40 minimum.
- **Chart tooltips** are hover-driven; on touch there is no hover. Wire tap-to-show
  on the four Recharts components.

## P3 — Polish

- Sticky per-page action bars (Confirm & Save, Add Employee) so primary actions stay
  reachable without scrolling a long card list.
- The "Swipe left to see more columns" hints become dead copy once cards ship — remove
  them per-screen as each table converts.
- `/auth/login` inputs to 44px min height; register/forgot/reset follow the same pass.
- Audit at 320px (iPhone SE) and 768px (iPad portrait) after P0–P2 land.
- `prefers-reduced-motion` on the drawer slide-in animations.

---

## Phasing & verification

| Phase | Scope | Risk | Notes |
|---|---|---|---|
| P0 | Shell, input font, 3 toolbars, KPI clipping | Medium — P0.1 touches every page's scroll model | Ship and verify before P1 |
| P1 | 4 tables → cards | Medium — most code, but additive below `sm` | One table per commit |
| P2 | Touch targets, font floor, chart taps | Low | Mostly class changes |
| P3 | Polish, 320px, reduced-motion | Low | |

Verification each phase: `npm run test` (383 baseline must stay green), `npm run build`,
plus a re-run of the Playwright probe at 375/320/768 asserting zero unintended
horizontal overflow and zero sub-16px inputs.

No DB migration. No API change. No desktop layout change intended at any point —
every change is gated behind a mobile-first breakpoint or is a hit-area expansion.

## Out of scope
Native app shell / PWA install, offline mode, mobile-specific navigation redesign
(the existing hamburger works), payslip PDF layout, chart library replacement.
