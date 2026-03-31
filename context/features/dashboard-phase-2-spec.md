# Overview Page — Phase 2 Spec
## Charts

---

## Goal
Replace the Phase 1 chart placeholders with fully rendered interactive charts using mock data. No API calls — all data from `@src/lib/mock-data.ts`.

## References
- `@context/design-reference.png` — primary visual reference
- `@context/DESIGN.md` — design system rules
- `@src/lib/mock-data.ts` — mock data source

## Chart Library
Use **Recharts** — it's compatible with Next.js App Router and works well with ShadCN. Install if not already present:
```bash
npm install recharts
```

---

## Requirements

### Chart 1 — Monthly Net Payout Trend (Row 2 Left)
**Type:** Line chart
**Width:** 60% of content area

- X-axis: months (JAN → DEC)
- Y-axis: RM values (RM 1M, RM 2M, etc.)
- Two lines:
  - "ACTUAL NET PAYOUT" — solid line, `primary` (#0056D2), with dot markers
  - "PROJECTED GROWTH" — dashed line, `on_surface_variant` (#424654)
- **Toggle buttons** top right of card: "6 MONTHS" / "1 YEAR" — active state uses `primary` background, inactive uses `surface_container_low`
- Card header: "Monthly Net Payout Trend" in Manrope `headline-sm`, subtitle "Full-year cash flow and growth projection" in Inter `body-md` `on_surface_variant`
- No grid lines — use subtle horizontal reference lines only
- Tooltip: show RM value on hover, styled with `surface_container_lowest` bg and ambient shadow

### Chart 2 — Branch Distribution (Row 2 Right)
**Type:** Horizontal bar list (not a chart library component — custom CSS bars)
**Width:** 40% of content area

- Each row: branch name (left) + RM total (right, `primary` color, tabular-numeric)
- Bar: full-width `primary` (#0056D2) bar, height 4px, width proportional to value
- Sorted highest to lowest
- Bottom of card: "VIEW COMPREHENSIVE REPORT" link button — `primary` color, `label-md` ALL CAPS, no background
- Card header: "Branch Distribution" in Manrope `headline-sm`, subtitle "Net payout by branch"

### Chart 3 — Salary Breakdown (Row 3 Left)
**Type:** Stacked bar chart
**Width:** 50% of content area

- X-axis: last 4 months (FEB, MAR, APR, MAY)
- Y-axis: RM values
- 4 stacked segments per bar:
  - Base Salary — `primary` (#0056D2)
  - Monthly Incentive — green (#22c55e)
  - Petrol Subsidy — amber (#f59e0b)
  - Penalty / Deductions — `tertiary` (#940002)
- Legend below chart title showing all 4 segments with color dots
- Card header: "Salary Breakdown" in Manrope `headline-sm`, subtitle "Monthly cost components across entire operation"
- Tooltip: show breakdown per segment on hover

### Chart 4 — Petrol Subsidy Eligibility Rate (Row 3 Right)
**Type:** Line chart
**Width:** 50% of content area

- X-axis: months (JANUARY → DECEMBER)
- Y-axis: percentage (0% → 100%)
- Two lines:
  - "CURRENT PERFORMANCE" — solid line, `primary` (#0056D2)
  - "BASELINE TARGET" — dashed line, `on_surface_variant`
- Large % value top right of card (e.g. "64.2%") in Manrope `display-lg`, `primary` color
- Sub-label: "+2.4% vs Baseline" in green below the % value
- Card header: "Petrol Subsidy Eligibility Rate" in Manrope `headline-sm`
- Subtitle: "% of dispatchers reaching ≥70 daily order threshold"
- Legend: "CURRENT PERFORMANCE" and "BASELINE TARGET" labels with line style indicators

---

## Design Rules
- No axis border lines — use tonal background only
- Tooltips use `surface_container_lowest` bg + ambient shadow (`0 12px 40px -12px rgba(25, 28, 29, 0.08)`)
- All RM values tabular-numeric (font-variant-numeric: tabular-nums)
- Chart containers: `surface_container_lowest` bg, `xl` radius, ambient shadow, no border
- Left accent trace (4px `tertiary`) on all non-hero cards

---

## Out of Scope (Phase 3)
- Top Performing Dispatchers table
- System Notifications
- Any live data or API calls
