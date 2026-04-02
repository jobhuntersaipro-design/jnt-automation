# Current Feature

**Database Setup** — Neon PostgreSQL + Prisma 7

Set up Prisma ORM with Neon PostgreSQL. Initial migration covering the full domain schema: Agent (tenant), Branch, Dispatcher, WeightTier, IncentiveRule, PetrolRule, Upload, SalaryRecord, SalaryLineItem, plus NextAuth v5 models (Account, Session, VerificationToken).

## Requirements

- Prisma 7 (breaking changes — follow upgrade guide)
- Neon PostgreSQL serverless with `DATABASE_URL` (pooled) + `DIRECT_URL` (direct, for migrations)
- Full schema from `@context/database-spec.md`
- Indexes for all high-frequency query patterns
- Cascade deletes wired correctly
- NextAuth v5 Prisma adapter configured with `agentId` instead of `userId`
- Seed 3 default WeightTier rows on every new Dispatcher creation (transaction)
- Never use `prisma db push` — migrations only

## Spec

See `@context/database-spec.md` for full schema and notes.

## Status

In Progress.

## Notes
Overview's notification icon to be updated after Upload and Payroll page.

## History

> Sorted from latest to earliest.

- 2026-03-31: **Dashboard UI Phase 3** — Completed. Dispatcher Performance full-width sortable table (avatar, name/ID, branch chip, net salary, base salary, incentive, petrol; search). Account menu dropdown (Settings + Logout). Branch and date filters wired to all charts via `ChartRange = { from: number; to: number }`. Custom date picker with month/year selects and end-date validation. Monthly Net Payout vs Base Salary dual-line chart with click-to-focus, inline legend, sky-blue base line. Branch Distribution: blue bars, Lucide user icon in ticks, hover dimming, filter note. All chart left borders unified to `border-on-surface-variant`. Salary Breakdown Y-axis always in M. Incentive Hit Rate Y-axis zoomed. SSR warnings suppressed with `minWidth={0}`.
- 2026-03-31: **Dashboard UI Phase 2** — Completed. Replaced all chart placeholders with interactive Recharts charts: Monthly Net Payout Trend (line chart, 6M/1Y toggle, MoM tooltip), Branch Distribution (custom CSS bars), Salary Breakdown (stacked bar, 4 segments, hover dim effect), Petrol Subsidy Eligibility Rate (line chart, MoM tooltip, large KPI value). Added Top Performing Dispatchers filter tabs (Net Salary / Orders / Base Salary). Active nav tab indicator via `usePathname`. All fonts scaled 20% larger. Summary cards vertically centered with consistent spacing. Y-axis spacing improved on line charts.
- 2026-03-30: **Dashboard UI Phase 1** — Completed. Overview page layout with summary cards (with month-over-month deltas), top nav bar with logo, branch/staff multi-select filters, and chart placeholders (monthly net payout trend bar chart, petrol subsidy eligibility rate line chart with HTML tooltip overlay). Mock data in `src/lib/mock-data.ts`. Route at `/dashboard`.
