# Overview Page — Real Data Migration (Part 1)

## Goal

Replace mock data in Summary Cards, Monthly Net Payout Trend, and Branch Distribution
with real data from Neon PostgreSQL via Prisma. No API routes — fetch directly in a
server component and pass data down as props.

## Scope

| Component | Status |
|---|---|
| Summary Cards | ✅ This part |
| Monthly Net Payout Trend | ✅ This part |
| Branch Distribution | ✅ This part |
| Salary Breakdown | ⏳ Part 2 |
| Incentive Hit Rate | ⏳ Part 2 |
| Top Dispatchers | ⏳ Part 2 |

---

## Architecture

```
page.tsx (server component)
  └── src/lib/db/overview.ts   ← Prisma query functions
        ├── getSummaryStats()
        ├── getMonthlyPayoutTrend()
        └── getBranchDistribution()
```

- `page.tsx` becomes an `async` server component
- All Prisma queries run at request time on the server
- Client components (`SummaryCards`, `MonthlyNetPayoutTrend`, `BranchDistribution`)
  receive typed data as props — no internal mock data imports
- Filters (branch, date range) passed as `searchParams` from the URL

---

## 1. Data Fetching — `src/lib/db/overview.ts`

### `getSummaryStats(agentId, filters)`

Aggregates across all `SalaryRecord` rows for the agent, filtered by selected branches
and date range.

**Returns:**
```ts
{
  totalNetPayout: number         // sum of netSalary
  avgMonthlySalary: number       // totalNetPayout / distinct dispatcher count
  totalDispatchers: number       // distinct dispatcherIds in range
  totalOrders: number            // sum of totalOrders

  // Previous period (same window shifted back by period length) for MoM deltas
  prev: {
    avgMonthlySalary: number
    totalDispatchers: number
    totalOrders: number
  }
}
```

**Query logic:**
```ts
// Current period
const records = await prisma.salaryRecord.findMany({
  where: {
    dispatcher: { branch: { agentId } },
    ...(branchIds.length > 0 && {
      dispatcher: { branch: { id: { in: branchIds } } }
    }),
    OR: months.map(({ month, year }) => ({ month, year })),
  },
  select: {
    dispatcherId: true,
    netSalary: true,
    totalOrders: true,
  },
});
```

Previous period uses the same query with months shifted back by the same number of months.

---

### `getMonthlyPayoutTrend(agentId, filters)`

Groups `SalaryRecord` by `month + year`, summing `netSalary` and `baseSalary`.

**Returns:**
```ts
Array<{
  month: string     // "JAN", "FEB", etc.
  actual: number    // sum of netSalary
  baseSalary: number // sum of baseSalary
}>
```

**Query logic:**
```ts
const records = await prisma.salaryRecord.groupBy({
  by: ["month", "year"],
  where: { ... },
  _sum: { netSalary: true, baseSalary: true },
  orderBy: [{ year: "asc" }, { month: "asc" }],
});
```

Map result to `{ month: "JAN", actual: ..., baseSalary: ... }` format expected by
the chart component.

---

### `getBranchDistribution(agentId)`

Always returns all branches for the agent — not affected by branch filter (matching
current behaviour noted in the UI).

**Returns:**
```ts
Array<{
  name: string          // branch code e.g. "KPG001"
  netPayout: number     // sum of netSalary across all time
  totalOrders: number   // sum of totalOrders across all time
  dispatcherCount: number // distinct dispatcher count
}>
```

**Query logic:**
```ts
const branches = await prisma.branch.findMany({
  where: { agentId },
  include: {
    dispatchers: {
      include: {
        salaryRecords: {
          select: { netSalary: true, totalOrders: true },
        },
      },
    },
  },
});
```

Aggregate in-memory per branch after fetch.

---

## 2. Filters via `searchParams`

Convert `page.tsx` to accept `searchParams` for filter state instead of `useState`.
Branch filter and date range become URL params — this keeps the page server-renderable.

```ts
// app/overview/page.tsx
export default async function OverviewPage({
  searchParams,
}: {
  searchParams: { branches?: string; from?: string; to?: string };
}) {
  const session = await getServerSession();
  const agentId = session.user.id;

  const selectedBranches = searchParams.branches?.split(",").filter(Boolean) ?? [];
  const from = Number(searchParams.from ?? 0);
  const to = Number(searchParams.to ?? 11);

  const [summary, trend, branchDist] = await Promise.all([
    getSummaryStats(agentId, { selectedBranches, from, to }),
    getMonthlyPayoutTrend(agentId, { selectedBranches, from, to }),
    getBranchDistribution(agentId),
  ]);

  return (
    <>
      <SummaryCards data={summary} />
      <MonthlyNetPayoutTrend data={trend} />
      <BranchDistribution data={branchDist} />
    </>
  );
}
```

The filter UI (branch multi-select, date range picker) becomes a client component
that pushes to `router.push` with updated `searchParams` on Apply.

---

## 3. Component Prop Changes

### `SummaryCards`

```ts
// Before — no props, reads mockSummary internally
export function SummaryCards() { ... }

// After
type SummaryStatsProps = {
  totalNetPayout: number
  avgMonthlySalary: number
  totalDispatchers: number
  totalOrders: number
  prev: {
    avgMonthlySalary: number
    totalDispatchers: number
    totalOrders: number
  }
}
export function SummaryCards({ data }: { data: SummaryStatsProps }) { ... }
```

### `MonthlyNetPayoutTrend`

```ts
// Before
export function MonthlyNetPayoutTrend({ chartRange }: { chartRange: ChartRange }) { ... }
// internally slices mockMonthlyTrendFull

// After
type TrendPoint = { month: string; actual: number; baseSalary: number }
export function MonthlyNetPayoutTrend({ data }: { data: TrendPoint[] }) { ... }
// chartRange slicing moves to the server — only the relevant months are fetched
```

### `BranchDistribution`

```ts
// Before
export function BranchDistribution({ selectedBranches }: { selectedBranches: string[] }) { ... }
// internally reads mockBranches

// After
type BranchPoint = { name: string; netPayout: number; totalOrders: number; dispatcherCount: number }
export function BranchDistribution({ data }: { data: BranchPoint[] }) { ... }
// selectedBranches filter removed — always shows all branches (server already handles this)
```

---

## 4. Files to Create / Modify

| File | Action |
|---|---|
| `src/lib/db/overview.ts` | Create — Prisma query functions |
| `src/app/overview/page.tsx` | Modify — convert to async server component |
| `src/components/dashboard/summary-cards.tsx` | Modify — accept data prop |
| `src/components/dashboard/monthly-net-payout-trend.tsx` | Modify — accept data prop |
| `src/components/dashboard/branch-distribution.tsx` | Modify — accept data prop |
| `src/lib/mock-data.ts` | Remove exports: `mockSummary`, `mockPrevSummary`, `mockMonthlyTrendFull`, `mockBranches` |

---

## 5. Notes

- **Auth guard:** All queries must be scoped by `agentId` from the session.
  Never query without it — data isolation is mandatory.
- **Empty state:** If no salary records exist yet (fresh account), all components
  should render gracefully with zero values, not crash.
- **Branch code display:** `Branch.code` is the raw J&T code (e.g. `KPG001`).
  Display as-is in Branch Distribution — no friendly name mapping needed yet.
- **No loading skeletons in Part 1:** Since page is server-rendered, data is ready
  before paint. Skeletons are only needed for client-side fetching (Part 2 if needed).
- **`Promise.all`:** Fetch all 3 data sets in parallel — do not await sequentially.

## Status

In Progress.
