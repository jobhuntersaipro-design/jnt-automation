# Spec — Branch Detail "People at Branch" Cards

> Add a row of 4 role-count cards (Dispatchers / Supervisors / Admins / Store Keepers) at the top of `/branches/[code]`, matching the icon palette already used on the `/branches` list page. Removes the redundant dispatcher count from the subtitle.

## Scope

`/branches/[code]` — `src/app/(dashboard)/branches/[code]/page.tsx`. No DB schema change, no new files.

## Why

The detail page currently shows the dispatcher count buried in a subtitle line and no breakdown of staff (supervisors / admins / store keepers) at the top, even though the data is loaded for the Employees table at the bottom. The list page already established the icon palette + role labels — reuse it for parity.

## Layout

Insert a new `<section aria-label="People at branch">` directly **above** the existing 6 financial summary cards (Net payout / Base salary / Bonus tier / Petrol subsidy / Penalty / Advance).

```
header (sticky)
├── back link
├── branch chip + "Branch overview" title + Add Employee button
└── subtitle  ← drop dispatcher count from here
─────────────
main
├── [NEW] section: People at branch         ← 4 cards: Dispatchers, Supervisors, Admins, Store Keepers
├── section: Branch totals                  ← existing 6 financial cards (unchanged)
├── section: Monthly trend                  ← existing chart
├── section: Dispatchers                    ← gains id="dispatchers-section"
└── section: Employees                      ← gains id="employees-section"
```

### Card style

Mirror the existing financial cards' visual weight but add an icon tile in the top-left corner:

```
┌────────────────────┐
│ [icon] LABEL       │
│                    │
│ N                  │
└────────────────────┘
```

- Container: `bg-white rounded-[0.75rem] p-4 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] border-l-4`
  with the existing `border-on-surface-variant` accent (matches the financial cards).
- Icon tile: `w-7 h-7 rounded-md` filled with role-specific tint, role-specific icon at 14px.
- Label: `text-[0.65rem] uppercase tracking-wider text-on-surface-variant/70 font-medium` (matches financial card label).
- Count: `text-[1.05rem] font-semibold tabular-nums` (matches financial card value), color = role accent when `> 0`, muted when `0`.

### Role palette (verbatim from `/branches` list page)

| Role | Icon | Tile bg | Tile fg | Count text |
| --- | --- | --- | --- | --- |
| Dispatchers | `Truck` | `bg-brand/10` | `text-brand` | `text-brand` |
| Supervisors | `ShieldCheck` | `bg-emerald-50` | `text-emerald-700` | `text-emerald-700` |
| Admins | `ClipboardList` | `bg-purple-50` | `text-purple-700` | `text-purple-700` |
| Store keepers | `Package` | `bg-amber-50` | `text-amber-700` | `text-amber-700` |

When count is `0`, fall back to `text-on-surface-variant/40` for the number to mute the empty state.

### Grid

- Desktop: `grid-cols-2 sm:grid-cols-4` — 4 across once the viewport allows.
- Mobile (375px): 2×2.

## Click behavior

Each card is an in-page anchor link.

- Dispatchers card → `#dispatchers-section`
- Supervisors / Admins / Store keepers cards → `#employees-section`

Implementation: render each card as `<a href="#dispatchers-section">…</a>`. Add `id` to the existing dispatchers/employees `<section>` wrappers. Lucide icons get `aria-hidden`. Card itself gets:

- `cursor-pointer`
- Hover: `hover:border-outline-variant/40 hover:shadow-[0_12px_40px_-12px_rgba(25,28,29,0.12)]`
- Focus-visible ring: `focus-visible:ring-2 focus-visible:ring-brand/50`
- `aria-label` like `"Jump to Supervisors at this branch (2)"` for screen readers.

`scroll-margin-top` on the target sections so the sticky header doesn't cover them after the jump. Existing sticky header is `pb-3 lg:pb-4`; set `scroll-mt-24 lg:scroll-mt-28` on the two destination sections.

## Subtitle update

```ts
- {summary.dispatcherCount} dispatcher{...} · {summary.monthCount} month{...} · {totals.totalOrders.toLocaleString()} lifetime orders
+ {summary.monthCount} month{...} of salary records · {totals.totalOrders.toLocaleString()} lifetime orders
```

Dispatcher count is now in its own card.

## Data

No DB / lib changes. Derive counts in the page from already-loaded `employees`:

```ts
const supervisorCount = employees.filter((e) => e.type === "SUPERVISOR").length;
const adminCount = employees.filter((e) => e.type === "ADMIN").length;
const storeKeeperCount = employees.filter((e) => e.type === "STORE_KEEPER").length;
```

`dispatcherCount` already comes from `summary.dispatcherCount`.

## Tests

No new vitest cases — the change is presentational on a server component with no extracted pure helpers worth testing in isolation.

## Manual QA

- 1280px: 4 cards across in one row above financial cards. Hover shadow visible. Click each card — page scrolls to the right section without sticky header overlap.
- 375px: 2×2 grid. Touch targets ≥ 44px. Cards still readable; icons + counts visible.
- Tab key: each card receives focus ring, Enter activates jump.
- Branch with 0 supervisors / admins / store keepers — those count cells render `0` muted; cards still clickable (jumps to empty Employees section, which renders a "no employees" message).
- Branch with all 4 zero (fresh branch) — cards render `0 / 0 / 0 / 0`; no errors, all jumps land on the empty-state copy.

## Out of scope

- No filtering by role on the destination tables — clicking Supervisors just scrolls; the Employees table stays unfiltered. Adding role-based query params on the staff list is a separate feature.
- No DB schema change.
- No payslip / salary impact.
