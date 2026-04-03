# Current Feature

None.

## Status

None.

## Notes
Overview's notification icon to be updated after Upload and Payroll page.

## History

> Sorted from latest to earliest.

- 2026-04-03: **Overview Real Data Migration (Part 1)** — Completed. Replaced mock data in Summary Cards, Monthly Net Payout Trend, and Branch Distribution with real Neon PostgreSQL data via Prisma. Created `src/lib/db/overview.ts` with `getSummaryStats`, `getMonthlyPayoutTrend`, `getBranchDistribution`. Converted `dashboard/page.tsx` to async server component with `searchParams`-driven filters. Extracted filter UI into `DashboardFilters` client component (pushes URL params on Apply). Dynamic Y-axis zoom on both charts. Branch codes display as alphabetic prefix (e.g. KPG). `prev` period delta on all summary cards including hero. Auth stubbed — queries first agent in DB, to be replaced with session once auth is set up.
- 2026-04-02: **Database Seed** — Completed. `prisma/seed.ts` seeding Neon development branch with 1 superadmin, 3 branches (Kepong, Cheras, Puchong), 18 dispatchers with weight tiers + incentive + petrol rules, 9 uploads, 54 salary records (Jan–Mar 2026). Uses `tsx` runner, `upsert` throughout for idempotency, driver adapter pattern for Prisma 7.
- 2026-04-02: **Database Setup** — Completed. Prisma 7 + Neon PostgreSQL. Full domain schema (Agent, Branch, Dispatcher, WeightTier, IncentiveRule, PetrolRule, Upload, SalaryRecord, SalaryLineItem) + NextAuth v5 models (Account, Session, VerificationToken) with `agentId` instead of `userId`. Driver adapter pattern (`@prisma/adapter-pg`), `prisma.config.ts` with `DIRECT_URL` for migrations, `DATABASE_URL` pooled for runtime. Initial migration applied to Neon development branch.
- 2026-03-31: **Dashboard UI Phase 3** — Completed. Dispatcher Performance full-width sortable table (avatar, name/ID, branch chip, net salary, base salary, incentive, petrol; search). Account menu dropdown (Settings + Logout). Branch and date filters wired to all charts via `ChartRange = { from: number; to: number }`. Custom date picker with month/year selects and end-date validation. Monthly Net Payout vs Base Salary dual-line chart with click-to-focus, inline legend, sky-blue base line. Branch Distribution: blue bars, Lucide user icon in ticks, hover dimming, filter note. All chart left borders unified to `border-on-surface-variant`. Salary Breakdown Y-axis always in M. Incentive Hit Rate Y-axis zoomed. SSR warnings suppressed with `minWidth={0}`.
- 2026-03-31: **Dashboard UI Phase 2** — Completed. Replaced all chart placeholders with interactive Recharts charts: Monthly Net Payout Trend (line chart, 6M/1Y toggle, MoM tooltip), Branch Distribution (custom CSS bars), Salary Breakdown (stacked bar, 4 segments, hover dim effect), Petrol Subsidy Eligibility Rate (line chart, MoM tooltip, large KPI value). Added Top Performing Dispatchers filter tabs (Net Salary / Orders / Base Salary). Active nav tab indicator via `usePathname`. All fonts scaled 20% larger. Summary cards vertically centered with consistent spacing. Y-axis spacing improved on line charts.
- 2026-03-30: **Dashboard UI Phase 1** — Completed. Overview page layout with summary cards (with month-over-month deltas), top nav bar with logo, branch/staff multi-select filters, and chart placeholders (monthly net payout trend bar chart, petrol subsidy eligibility rate line chart with HTML tooltip overlay). Mock data in `src/lib/mock-data.ts`. Route at `/dashboard`.
