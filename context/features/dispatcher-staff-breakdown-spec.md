# Spec — Dispatcher / Staff Salary Breakdown

> Surface the dispatcher-vs-staff split anywhere we currently show "total net payout". Replace the Net-Payout-vs-Base-Salary line chart with a stacked bar of dispatcher + staff per month. Stop masking IC numbers.

## Scope

| Change | File |
| --- | --- |
| Hero card subline `Dispatchers RM X · Staff RM Y` | `src/components/dashboard/summary-cards.tsx` |
| Avg Monthly Salary card shows two values | same |
| Replace line chart with stacked-bar breakdown | new `src/components/dashboard/dispatcher-staff-breakdown.tsx`; delete `monthly-net-payout-trend.tsx` from the page (kept on disk for reference) |
| Branch detail Net payout card sub-line | `src/app/(dashboard)/branches/[code]/page.tsx` |
| Drop `maskIc()` calls at every read path | `src/lib/db/staff.ts` (dispatchers list), `src/lib/db/employees.ts`, `src/lib/db/branches.ts` (employee row), `src/app/api/employees/route.ts`, `src/components/staff/employee-drawer.tsx` |

## Data model

`SalaryRecord.netSalary` = dispatcher's standalone net.
`EmployeeSalaryRecord.netSalary` = employee's net (which **already absorbs the linked dispatcher's gross + statutory** when the employee has a dispatcher FK or a name+branch match).

For the breakdown, we adopt the simplest defensible semantic:

- **Dispatcher payroll** = `Σ SalaryRecord.netSalary` (the dispatcher salary system's own output).
- **Staff payroll** = `Σ EmployeeSalaryRecord.netSalary` (the employee salary system's own output).
- **Total Net Payout** (where displayed today) **= dispatcher + staff** — the same number we currently show, but now broken down.

There is a known overlap: a person who is both an employee *and* a dispatcher has an `EmployeeSalaryRecord` whose net already includes the linked dispatcher's gross. Today we already over-count this in the Net Payout total because both records exist independently. This spec doesn't fix that — it only labels the existing parts. A follow-up to deduplicate combined records is out of scope (would require either a "primary record" flag or a join-then-pick rule in every aggregation).

## Backend

### `src/lib/db/overview.ts`

`getSummaryStats` extended:

```ts
export type SummaryStats = {
  totalNetPayout: number;
  netPayoutByRole: { dispatcher: number; staff: number };
  avgMonthlySalary: { dispatcher: number; staff: number };
  totalDispatchers: number;
  totalStaff: number;
  totalOrders: number;
  prev: { /* same shape */ };
};
```

Implementation:
1. Continue to query `SalaryRecord` for the dispatcher half (unchanged).
2. Query `EmployeeSalaryRecord` for the staff half, filtered by employee's `agentId` and `branch.code in selectedBranchCodes` (when set), month/year in range.
3. `avgMonthlySalary.dispatcher = dispatcherTotal / uniqueDispatchers` (existing behavior).
4. `avgMonthlySalary.staff = staffTotal / uniqueStaffEmployees`.
5. `totalNetPayout = dispatcherTotal + staffTotal`.

New `getMonthlyDispatcherStaffBreakdown(agentId, filters): Promise<{ month: string; dispatcher: number; staff: number }[]>` replaces what the line chart consumed. Aggregates both tables by `(year, month)` and returns the abbreviated month label.

`getMonthlyPayoutTrend` kept on disk but the dashboard stops calling it. Removable in a later cleanup.

### `src/lib/db/branches.ts`

`BranchSummary.totals.netSalary: number` → `BranchSummary.totals.netSalary: { dispatcher: number; staff: number; total: number }`. New aggregation pulls `EmployeeSalaryRecord` for employees at this branch over all months.

### IC unmasking

Each call site changes from `maskIc(e.icNo)` / `"•".repeat(8) + e.icNo.slice(-4)` to the raw IC string. The `maskIc` helper itself stays in `staff.ts` (cheap to keep, may need it later) but its tests in `staff.test.ts` continue to pass since they exercise the helper directly.

Drawer's local optimistic update (`employee-drawer.tsx:193`) drops the post-save mask and stores the raw IC instead.

## Frontend

### Overview hero card (`summary-cards.tsx`)

```
┌────────────────────────────────────────┐
│ TOTAL NET PAYOUT                       │
│ RM 12,345                              │
│ Dispatchers RM 9,000 · Staff RM 3,345  │  ← new sub-line
│ +5.2% vs prev period                   │
└────────────────────────────────────────┘
```

The Avg Monthly Salary card replaces its single number with two stacked values:

```
┌────────────────────────────────────────┐
│ AVG MONTHLY SALARY                     │
│ Dispatchers   RM 1,800/mo              │
│ Staff         RM 2,500/mo              │
│ +3.1% vs prev period (combined)        │
└────────────────────────────────────────┘
```

If either side has zero people, that line shows `—` muted. Stat cards remain at the same height visually (typography handles the difference).

### Stacked bar chart (`dispatcher-staff-breakdown.tsx`)

Recharts `BarChart` with `<Bar stackId="net" dataKey="dispatcher" />` (brand) and `<Bar stackId="net" dataKey="staff" />` (a complementary tint, e.g. emerald). X axis = month abbr. Y axis = RM in K/M shorthand. Tooltip shows `Dispatchers RM X · Staff RM Y · Total RM Z`. Header (with the same `flex flex-col sm:flex-row` cleanup we just did) reads `Net Payout by Role`.

### Branch detail Net Payout card

Single card height, but the value cell now stacks:

```
NET PAYOUT
RM 12,345
Dispatchers RM 9,000 · Staff RM 3,345
```

The other 5 cards (Base salary, Bonus tier, Petrol subsidy, Penalty, Advance) stay dispatcher-only — those concepts don't apply to staff.

## Tests (TDD)

### `src/lib/db/__tests__/breakdown.test.ts` (new)

Pure helper `splitNetPayout(records, employeeRecords): { dispatcher, staff, total }` extracted so the math is testable without DB plumbing:

1. Empty records → all zeros.
2. Only dispatcher records → dispatcher = sum, staff = 0.
3. Only employee records → staff = sum, dispatcher = 0.
4. Mixed → both populated.

### `src/lib/staff/__tests__/avg-monthly.test.ts` (new)

Pure helper `computeAvgMonthlySalary({ dispatcherTotal, dispatcherUnique, staffTotal, staffUnique })`:

1. Both populated → returns both averages.
2. Zero dispatchers → dispatcher = 0 (no division).
3. Zero staff → staff = 0.
4. Negative inputs not expected; not asserted.

Existing `staff.test.ts` `maskIc` tests stay green (helper unchanged).

## Manual QA

1. Overview at desktop + 375px: hero sub-line readable, Avg Monthly Salary card has two readable rows, stacked bar tooltip shows the split + total.
2. Branch detail QA001: Net payout card shows the breakdown; other 5 cards unchanged.
3. Staff Settings + Dispatchers Settings: IC column shows the full 12-digit number (no dots).
4. Branch detail Employees table: same — full IC visible.

## Out of scope

- Deduplicating "combined record" people whose `EmployeeSalaryRecord` already absorbs the linked dispatcher's gross — flagged in **Data model** above; tracked separately.
- Per-branch dispatcher-vs-staff trend (the new chart is agent-wide).
- Removing the now-unused `monthly-net-payout-trend.tsx` and `getMonthlyPayoutTrend` — kept on disk in this branch, can be deleted in a follow-up cleanup.
