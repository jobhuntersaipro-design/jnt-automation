# Current Feature: Auth Phase 1 — NextAuth v5 Setup + Google Provider

## Status

In Progress

## Goals

- Install NextAuth v5 (`next-auth@beta`) and `@auth/prisma-adapter`
- Set up split auth config pattern for edge compatibility (`src/auth.config.ts` + `src/auth.ts`)
- Add Google OAuth provider
- Create API route handler at `src/app/api/auth/[...nextauth]/route.ts`
- Protect `/dashboard/*` routes via Next.js middleware (proxy pattern)
- Redirect unauthenticated users to `/auth/login`
- Extend Session type with `user.id` and `user.isApproved` in `src/types/next-auth.d.ts`
- Implement approval gate: redirect unapproved users to `/auth/pending` after Google sign-in

## Notes

- Schema uses `Agent` instead of `User` and `agentId` instead of `userId` — configure Prisma adapter with `userModel: "agent"`, `accountModel: "account"`, `sessionModel: "session"`
- Google OAuth credentials needed: `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
- Use NextAuth's default sign-in pages for testing (custom pages come in Phase 2/3)
- Approval check in `signIn` callback: if `isApproved: false`, return `"/auth/pending"`
- Authorised redirect URI for dev: `http://localhost:3000/api/auth/callback/google`
- Overview's notification icon to be updated after Upload and Payroll page.

## History

> Sorted from latest to earliest.

- 2026-04-06: **Code Quality Quick Wins** — Completed. Fixed broken loading skeletons (`bg-surface-container-high` → `bg-surface-hover`). Fixed `unstable_cache` static cache key to include `agentId` + filters to prevent cross-tenant data leaks once auth is wired in. Eliminated N+1 queries in `getBranchDistribution` (now uses `groupBy`), `getIncentiveHitRate` (thresholds fetched once via `Map`), and `getTopDispatchers` (DB-level `groupBy` + `orderBy` + `take 20`). Created `src/lib/chart-colors.ts` and replaced all raw hex strings across 4 chart components. Fixed arbitrary hover hex in `account-menu.tsx`. Made year range in date filter dynamic. Removed dead `mock-data.ts` and replaced `mockNotifications` import with empty typed state. Deduplicated `MONTH_ABBR` constant and `DispatcherRow` type. Fixed nav active-state false-match with path-segment check. Extracted shared `useClickOutside` hook to `src/lib/hooks/use-click-outside.ts` and applied to 3 components. Fixed Recharts `width/height -1` SSR warning by replacing CSS class heights with inline `style` on all 4 chart container divs. Build passes clean.
- 2026-04-03: **Overview Real Data Migration (Part 2)** — Completed. Migrated remaining charts (Salary Breakdown, Incentive Hit Rate, Top Dispatchers) from mock data to real Neon PostgreSQL via Prisma. Added `getSalaryBreakdown`, `getIncentiveHitRate`, `getTopDispatchers` to `src/lib/db/overview.ts`. Deleted `src/lib/mock-data.ts`. Added full-page loading skeleton (`loading.tsx`). Fixed `getBranchDistribution` to respect the selected date filter. Wrapped all filter-dependent queries in `unstable_cache` (5-min TTL) so repeated filter combos are served instantly. Fixed SSL warning (`sslmode=verify-full`). Filter state (date range + branches) now persists on page refresh via URL params. Replaced filter-area spinner with indeterminate progress bar at top of page. Added "% changes compared to [prev period]" note below summary cards. Updated logo. Fixed branch/date font size mismatch in filter bar.
- 2026-04-03: **Overview Real Data Migration (Part 1)** — Completed. Replaced mock data in Summary Cards, Monthly Net Payout Trend, and Branch Distribution with real Neon PostgreSQL data via Prisma. Created `src/lib/db/overview.ts` with `getSummaryStats`, `getMonthlyPayoutTrend`, `getBranchDistribution`. Converted `dashboard/page.tsx` to async server component with `searchParams`-driven filters. Extracted filter UI into `DashboardFilters` client component (pushes URL params on Apply). Dynamic Y-axis zoom on both charts. Branch codes display as alphabetic prefix (e.g. KPG). `prev` period delta on all summary cards including hero. Auth stubbed — queries first agent in DB, to be replaced with session once auth is set up.
- 2026-04-02: **Database Seed** — Completed. `prisma/seed.ts` seeding Neon development branch with 1 superadmin, 3 branches (Kepong, Cheras, Puchong), 18 dispatchers with weight tiers + incentive + petrol rules, 9 uploads, 54 salary records (Jan–Mar 2026). Uses `tsx` runner, `upsert` throughout for idempotency, driver adapter pattern for Prisma 7.
- 2026-04-02: **Database Setup** — Completed. Prisma 7 + Neon PostgreSQL. Full domain schema (Agent, Branch, Dispatcher, WeightTier, IncentiveRule, PetrolRule, Upload, SalaryRecord, SalaryLineItem) + NextAuth v5 models (Account, Session, VerificationToken) with `agentId` instead of `userId`. Driver adapter pattern (`@prisma/adapter-pg`), `prisma.config.ts` with `DIRECT_URL` for migrations, `DATABASE_URL` pooled for runtime. Initial migration applied to Neon development branch.
- 2026-03-31: **Dashboard UI Phase 3** — Completed. Dispatcher Performance full-width sortable table (avatar, name/ID, branch chip, net salary, base salary, incentive, petrol; search). Account menu dropdown (Settings + Logout). Branch and date filters wired to all charts via `ChartRange = { from: number; to: number }`. Custom date picker with month/year selects and end-date validation. Monthly Net Payout vs Base Salary dual-line chart with click-to-focus, inline legend, sky-blue base line. Branch Distribution: blue bars, Lucide user icon in ticks, hover dimming, filter note. All chart left borders unified to `border-on-surface-variant`. Salary Breakdown Y-axis always in M. Incentive Hit Rate Y-axis zoomed. SSR warnings suppressed with `minWidth={0}`.
- 2026-03-31: **Dashboard UI Phase 2** — Completed. Replaced all chart placeholders with interactive Recharts charts: Monthly Net Payout Trend (line chart, 6M/1Y toggle, MoM tooltip), Branch Distribution (custom CSS bars), Salary Breakdown (stacked bar, 4 segments, hover dim effect), Petrol Subsidy Eligibility Rate (line chart, MoM tooltip, large KPI value). Added Top Performing Dispatchers filter tabs (Net Salary / Orders / Base Salary). Active nav tab indicator via `usePathname`. All fonts scaled 20% larger. Summary cards vertically centered with consistent spacing. Y-axis spacing improved on line charts.
- 2026-03-30: **Dashboard UI Phase 1** — Completed. Overview page layout with summary cards (with month-over-month deltas), top nav bar with logo, branch/staff multi-select filters, and chart placeholders (monthly net payout trend bar chart, petrol subsidy eligibility rate line chart with HTML tooltip overlay). Mock data in `src/lib/mock-data.ts`. Route at `/dashboard`.
