# Overview Page — Phase 3 Spec
## Top Performing Dispatchers & System Notifications

---

## Goal
Replace the Phase 1 placeholders in Row 4 with the Top Performing Dispatchers table and System Notifications panel. Still using mock data from `@src/lib/mock-data.ts`.

## References
- `@context/design-reference.png` — primary visual reference
- `@context/DESIGN.md` — design system rules
- `@src/lib/mock-data.ts` — mock data source

---

## Requirements

### 1. Top Performing Dispatchers (Row 4 Left)
**Width:** 60% of content area

**Card header row:**
- Left: "Top Performing Dispatchers" in Manrope `headline-sm` + subtitle "By net salary this period" in Inter `body-md` `on_surface_variant`
- Right: Search input ("Search dispatchers...") with `Search` icon + filter icon (`SlidersHorizontal`)

**Table columns:**
| Column | Notes |
|--------|-------|
| DISPATCHER | Avatar + name + dispatcher ID below name |
| BRANCH | Branch name as a chip/badge |
| TOTAL DELIVERIES | Numeric, tabular-numeric |
| NET SALARY | RM value, `primary` color, tabular-numeric, `title-md` |
| COMPLIANCE STATUS | "VERIFIED" (green chip) or "PENDING" (amber chip) |

**Table rules:**
- No divider lines between rows
- Row padding: `spacing-4` (0.9rem) vertical
- Row hover: `surface_container_high` (#e7e8e9) background transition
- Column headers: Inter `label-md` ALL CAPS, `+0.05em` tracking, `on_surface_variant`
- Show top 5 dispatchers by default

**Avatar:**
- Circle avatar with gender-derived ring colour
  - Male: `primary` (#0056D2) 2px ring
  - Female: soft rose (#f472b6) 2px ring
- If no avatar uploaded: show initials (first + last name initials) on `surface_container_low` background

**Compliance Status chips:**
- VERIFIED: green background (`#dcfce7`), green text (`#16a34a`), `label-md`, `md` radius
- PENDING: amber background (`#fef9c3`), amber text (`#ca8a04`), `label-md`, `md` radius

**Footer row:**
- Left: "SHOWING TOP 5 OF [total] TOTAL DISPATCHERS" in Inter `label-md` ALL CAPS `on_surface_variant`
- Right: "VIEW ALL STAFF" link in `primary` color, `label-md`

---

### 2. System Notifications (Row 4 Right)
**Width:** 40% of content area

**Card header row:**
- Left: "System Notifications" in Manrope `headline-sm` + subtitle "Recent activity"
- Right: "Clear All" text button in `on_surface_variant`

**Notification item structure:**
- Icon (left): coloured circle with relevant Lucide icon inside
  - Upload: `Upload` icon, `primary` bg
  - Payroll finalized: `BadgeDollarSign` icon, green bg
  - New dispatcher detected: `UserPlus` icon, amber bg
  - Data sync: `RefreshCw` icon, `primary` bg
- Content (middle):
  - Title in Inter `body-md` semi-bold, `on_surface`
  - Description in Inter `body-md`, `on_surface_variant`
- Timestamp (right): Inter `label-md`, `on_surface_variant` (e.g. "14 MINS AGO")

**Mock notification types to show:**
1. Upload Request — "Kepong Branch · March 2025"
2. Payroll Finalised — "All 6 branches · 312 dispatchers"
3. Data Entry Complete — "Cheras Branch · 3 new dispatchers detected"

**No divider lines between items** — use `spacing-4` gap instead.

---

## Design Rules
- No divider lines anywhere
- All chips use `md` (0.375rem) radius — no pill shapes
- Tabular-numeric for all numbers
- All cards: `surface_container_lowest` bg, `xl` radius, ambient shadow, 4px `tertiary` left accent trace
- Use design token classes, never raw hex
- Responsive design

---

## Definition of Done
- [ ] Items/types with links to /items/TYPE (eg.items/snippets)
- [ ] Top Performing Dispatchers table renders with mock data
- [ ] Avatar initials show correctly with gender ring colour
- [ ] Compliance status chips render correctly (VERIFIED / PENDING)
- [ ] Footer shows correct dispatcher count
- [ ] System Notifications panel renders with 3 mock items
- [ ] All currency shows as RM
- [ ] Full overview page matches design-reference.png layout
- [ ] Animations for all charts
- [ ] All data must be based on filters
- [ ] `npm run build` passes with no errors
