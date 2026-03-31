# Current Feature

**Dashboard UI Phase 2** — Charts

Replace Phase 1 chart placeholders with fully rendered interactive charts using Recharts and mock data from `src/lib/mock-data.ts`. No API calls.

## Charts to Implement

1. **Monthly Net Payout Trend** (Row 2 Left, 60% width) — Line chart with "ACTUAL NET PAYOUT" (solid, primary) and "PROJECTED GROWTH" (dashed, on_surface_variant) lines. Toggle buttons: "6 MONTHS" / "1 YEAR".
2. **Branch Distribution** (Row 2 Right, 40% width) — Custom CSS horizontal bar list, sorted highest to lowest, with "VIEW COMPREHENSIVE REPORT" link at bottom.
3. **Salary Breakdown** (Row 3 Left, 50% width) — Stacked bar chart for last 4 months with 4 segments: Base Salary (primary), Monthly Incentive (green), Petrol Subsidy (amber), Penalty/Deductions (tertiary).
4. **Petrol Subsidy Eligibility Rate** (Row 3 Right, 50% width) — Line chart with % on Y-axis, large % value top right, "+2.4% vs Baseline" sub-label.

## Spec

See `@context/features/dashboard-phase-2-spec.md` for full details.

## Status

Completed.

## History

> Sorted from latest to earliest.

- 2026-03-31: **Dashboard UI Phase 2** — Completed. Replaced all chart placeholders with interactive Recharts charts: Monthly Net Payout Trend (line chart, 6M/1Y toggle, MoM tooltip), Branch Distribution (custom CSS bars), Salary Breakdown (stacked bar, 4 segments, hover dim effect), Petrol Subsidy Eligibility Rate (line chart, MoM tooltip, large KPI value). Added Top Performing Dispatchers filter tabs (Net Salary / Orders / Base Salary). Active nav tab indicator via `usePathname`. All fonts scaled 20% larger. Summary cards vertically centered with consistent spacing. Y-axis spacing improved on line charts.
- 2026-03-30: **Dashboard UI Phase 1** — Completed. Overview page layout with summary cards (with month-over-month deltas), top nav bar with logo, branch/staff multi-select filters, and chart placeholders (monthly net payout trend bar chart, petrol subsidy eligibility rate line chart with HTML tooltip overlay). Mock data in `src/lib/mock-data.ts`. Route at `/dashboard`.
