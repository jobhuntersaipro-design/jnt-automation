# Overview Page — Real Data Migration (Part 2)

## Goal

Replace mock data in Salary Breakdown, Incentive Hit Rate, and Top Dispatchers table
with real data from Neon PostgreSQL via Prisma. Builds on Part 1 — assumes
`src/lib/db/overview.ts` and the server component pattern are already in place.

## Scope

| Component | Status |
|---|---|
| Summary Cards | ✅ Part 1 |
| Monthly Net Payout Trend | ✅ Part 1 |
| Branch Distribution | ✅ Part 1 |
| Salary Breakdown | ✅ This part |
| Incentive Hit Rate | ✅ This part |
| Top Dispatchers | ✅ This part |

---

## Architecture

```
page.tsx (server component)
  └── src/lib/db/overview.ts   ← extend with 3 new functions
        ├── getSalaryBreakdown()
        ├── getIncentiveHitRate()
        └── getTopDispatchers()
```

Same pattern as Part 1 — functions added to `src/lib/db/overview.ts`, called in
`Promise.all` in `page.tsx`, passed as props to client components.

---

## 1. Data Fetching — extend `src/lib/db/overview.ts`

### `getSalaryBreakdown(agentId, filters)`

Groups `SalaryRecord` by `month + year`, summing each salary component.

**Returns:**
```ts
Array<{
  month: string       // "JAN", "FEB", etc.
  baseSalary: number
  incentive: number
  petrolSubsidy: number
  deductions: number  // penalty + advance combined
}>
```

**Query logic:**
```ts
const records = await prisma.salaryRecord.groupBy({
  by: ["month", "year"],
  where: { ... }, // same agentId + branch + date range filter as Part 1
  _sum: {
    baseSalary: true,
    incentive: true,
    petrolSubsidy: true,
    penalty: true,
    advance: true,
  },
  orderBy: [{ year: "asc" }, { month: "asc" }],
});

// Map: deductions = penalty + advance
```

---

### `getIncentiveHitRate(agentId, filters)`

For each month, calculates what % of dispatchers hit their individual `orderThreshold`.

**Returns:**
```ts
Array<{
  month: string   // "JAN", "FEB", etc.
  rate: number    // percentage e.g. 63.4
}>
```

**Query logic:**

Cannot use `groupBy` alone — needs per-dispatcher comparison against their own threshold.
Fetch records with incentive rule joined:

```ts
const records = await prisma.salaryRecord.findMany({
  where: { ... },
  select: {
    month: true,
    year: true,
    totalOrders: true,
    dispatcher: {
      select: {
        incentiveRule: { select: { orderThreshold: true } },
      },
    },
  },
});

// Group by month, count how many hit threshold vs total
// rate = (hitCount / totalCount) * 100
```

---

### `getTopDispatchers(agentId, filters)`

Fetches the most recent month's salary records (or across the selected range),
aggregated per dispatcher.

**Returns:**
```ts
Array<{
  id: string           // dispatcher.extId
  name: string
  branch: string       // branch.code
  gender: "MALE" | "FEMALE" | "UNKNOWN"
  avatarUrl: string | null
  totalOrders: number
  baseSalary: number
  incentive: number
  petrolSubsidy: number
  netSalary: number
}>
```

**Query logic:**

If date range spans multiple months, aggregate (sum) across the range per dispatcher.
If single month, direct fetch.

```ts
const records = await prisma.salaryRecord.findMany({
  where: { ... },
  select: {
    totalOrders: true,
    baseSalary: true,
    incentive: true,
    petrolSubsidy: true,
    netSalary: true,
    dispatcher: {
      select: {
        extId: true,
        name: true,
        gender: true,
        avatarUrl: true,
        branch: { select: { code: true } },
      },
    },
  },
});

// Group by dispatcherId, sum all numeric fields
// Return all dispatchers — sorting handled client-side in the table component
```

---

## 2. Component Prop Changes

### `SalaryBreakdown`

```ts
// Before
export function SalaryBreakdown({ chartRange }: { chartRange: ChartRange }) { ... }
// internally slices mockSalaryBreakdownFull

// After
type BreakdownPoint = {
  month: string
  baseSalary: number
  incentive: number
  petrolSubsidy: number
  deductions: number
}
export function SalaryBreakdown({ data }: { data: BreakdownPoint[] }) { ... }
```

### `IncentiveHitRate`

```ts
// Before
export function IncentiveHitRate({ chartRange }: { chartRange: ChartRange }) { ... }
// internally reads mockIncentiveHitRateFull

// After
type HitRatePoint = { month: string; rate: number }
export function IncentiveHitRate({ data }: { data: HitRatePoint[] }) { ... }
```

### `TopDispatchers`

```ts
// Before
export function TopDispatchers({ selectedBranches }: { selectedBranches: string[] }) { ... }
// internally reads mockTopDispatchers, filters client-side

// After
type DispatcherRow = {
  id: string
  name: string
  branch: string
  gender: "MALE" | "FEMALE" | "UNKNOWN"
  avatarUrl: string | null
  totalOrders: number
  baseSalary: number
  incentive: number
  petrolSubsidy: number
  netSalary: number
}
export function TopDispatchers({ data }: { data: DispatcherRow[] }) { ... }
// branch filter already applied server-side — component just sorts + searches
// search and column sort remain client-side as they are now
```

---

## 3. `page.tsx` — Add to `Promise.all`

```ts
const [summary, trend, branchDist, breakdown, hitRate, dispatchers] = await Promise.all([
  getSummaryStats(agentId, filters),
  getMonthlyPayoutTrend(agentId, filters),
  getBranchDistribution(agentId),
  getSalaryBreakdown(agentId, filters),       // new
  getIncentiveHitRate(agentId, filters),      // new
  getTopDispatchers(agentId, filters),        // new
]);
```

---

## 4. Files to Create / Modify

| File | Action |
|---|---|
| `src/lib/db/overview.ts` | Extend — add 3 new query functions |
| `src/app/overview/page.tsx` | Modify — add 3 new data fetches to Promise.all |
| `src/components/dashboard/salary-breakdown.tsx` | Modify — accept data prop |
| `src/components/dashboard/incentive-hit-rate.tsx` | Modify — accept data prop |
| `src/components/dashboard/top-dispatchers.tsx` | Modify — accept data prop |
| `src/lib/mock-data.ts` | Remove remaining exports — file can be deleted after this part |

---

## 5. Notes

- **Incentive hit rate calculation:** Each dispatcher has their own `orderThreshold`
  on `IncentiveRule`. The rate is not a fixed threshold — compare each dispatcher's
  `totalOrders` against their own rule. This requires joining `incentiveRule` in the
  query, not a simple `groupBy`.
- **Top Dispatchers across multi-month range:** When the date range spans multiple
  months, sum all salary fields per dispatcher and display the aggregate. This gives
  a true picture of performance over the selected period, not just one month.
- **Empty state:** If no records exist, `TopDispatchers` should show an empty state
  message, charts should render with empty arrays (Recharts handles this gracefully).
- **Auth scope:** All queries scoped by `agentId` — same rule as Part 1.
- **`mock-data.ts` cleanup:** After Part 2, `mock-data.ts` should only contain
  `mockNotifications` (used by the notification panel, not yet wired to DB).
  Delete the file only once all mock imports are removed.

## Status

Not Started. Complete Part 1 first.
