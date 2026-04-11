# Staff Page Update — Settings History Tab

## Overview

Add a History tab to the existing dispatcher drawer. Shows per-month snapshots
from past confirmed salary records. Agent can view what rules were applied each
month, edit a past month's snapshot, and trigger recalculation for just that
dispatcher for that month.

## What's Already Built

- Dispatcher list with branch filter + search
- Side drawer with Settings tab (inline editing, save on blur)
- Weight tiers popover (all 3 tiers at once)
- Pin + delete actions
- Add Dispatcher drawer
- Avatar upload

## What This Spec Adds

- History tab inside the existing dispatcher drawer
- Per-month snapshot view from SalaryRecord
- Inline editing of past month snapshots
- Recalculate confirmation dialog
- "Download Updated Payslip" button after recalculation

---

## Drawer Tab Change

Add a second tab to the existing drawer:

```
[Settings]  [History]
```

History tab is empty (disabled) if dispatcher has no confirmed salary records.

---

## History Tab Layout

### List View

```
MONTH           NET SALARY      STATUS           ACTIONS
March 2026      RM 4,220.00     ✅ Confirmed      [View / Edit]
February 2026   RM 3,805.00     🔄 Recalculated   [View / Edit]  [↓ Payslip]
January 2026    RM 3,640.00     ✅ Confirmed      [View / Edit]
```

**Status badges:**
- `✅ Confirmed` — original confirmation, never modified
- `🔄 Recalculated` — modified after confirmation (`updatedAt > createdAt`)

**"Download Payslip" button:**
- Only shown on rows that have been recalculated
- Non-recalculated months → payslip downloadable from Payroll page directly
- Clicking → `POST /api/payroll/payslip/[salaryRecordId]` → PDF downloads

**Empty state:**
"No salary records yet. Upload delivery data in the Payroll page to get started."

---

## View / Edit a Past Month

Clicking "View / Edit" expands an inline panel below the row.

### Panel Layout

```
February 2026 — Settings used
─────────────────────────────────────────

WEIGHT TIERS
  T1   0 – 5 kg       RM [1.00]
  T2   5.01 – 10 kg   RM [1.40]
  T3   10.01 kg +     RM [2.20]

INCENTIVE
  Order threshold      [2000]   orders/month
  Incentive amount     RM [260]

PETROL SUBSIDY
  Eligible             ✅
  Daily threshold      [70]     orders/day
  Subsidy amount       RM [15]

─────────────────────────────────────────
[Cancel]    [Recalculate February 2026 →]
```

**Behaviour:**
- All fields editable inline
- "Recalculate" button disabled if no changes made
- "Recalculate" button enabled as soon as any field changes
- Clicking "Cancel" → collapses panel, discards edits
- Only one month expanded at a time — expanding another collapses current

---

## Recalculate Confirmation Dialog

```
Recalculate February 2026 for Ahmad Faizal?

Changes detected:
• Incentive amount: RM 260 → RM 300

This will update the salary record and snapshot
for Feb 2026 only. Current staff settings will
not be affected.

[Cancel]   [Recalculate]
```

**Dialog shows only changed fields** — unchanged fields not listed.
If multiple fields changed → list all changes.

---

## After Recalculation

1. `SalaryRecord` updated:
   - `baseSalary`, `incentive`, `petrolSubsidy`, `netSalary` recalculated
   - `weightTiersSnapshot`, `incentiveSnapshot`, `petrolSnapshot` updated
   - `updatedAt` timestamp updated automatically by Prisma
2. History list row updates:
   - Net salary shows new value
   - Badge changes to `🔄 Recalculated`
   - "Download Updated Payslip" button appears
3. Toast: "[Month Year] recalculated for [Dispatcher Name]"
4. Panel collapses automatically

**"Download Updated Payslip" button:**
- Clicking → `POST /api/payroll/payslip/[salaryRecordId]`
- PDF generated server-side using updated snapshot
- Downloads as `payslip_[extId]_[month]_[year].pdf`
- Button stays visible on all future visits (persisted via `updatedAt > createdAt` check)

---

## Recalculation Logic

Server-side — uses existing `SalaryLineItem` rows, not the original Excel file:

```ts
// src/app/api/staff/[id]/recalculate/route.ts

// 1. Load existing line items for this salary record
const lineItems = await prisma.salaryLineItem.findMany({
  where: { salaryRecordId },
});

// 2. Re-run calculation using updated snapshot values
const baseSalary = lineItems.reduce((sum, li) => {
  const tier = updatedWeightTiers.find(t =>
    li.weight >= t.minWeight &&
    (t.maxWeight === null || li.weight <= t.maxWeight)
  );
  return sum + (tier?.commission ?? 0);
}, 0);

const totalOrders = lineItems.length;
const incentive = totalOrders >= updatedIncentive.orderThreshold
  ? updatedIncentive.incentiveAmount : 0;

// Group by date for petrol
const byDate = groupBy(lineItems, li => li.deliveryDate?.toDateString());
let petrolSubsidy = 0;
if (updatedPetrol.isEligible) {
  for (const dayItems of Object.values(byDate)) {
    if (dayItems.length >= updatedPetrol.dailyThreshold) {
      petrolSubsidy += updatedPetrol.subsidyAmount;
    }
  }
}

const netSalary = baseSalary + incentive + petrolSubsidy
  - record.penalty - record.advance;

// 3. Update SalaryRecord + snapshots
await prisma.salaryRecord.update({
  where: { id: salaryRecordId },
  data: {
    baseSalary,
    incentive,
    petrolSubsidy,
    netSalary,
    weightTiersSnapshot: updatedWeightTiers,
    incentiveSnapshot: updatedIncentive,
    petrolSnapshot: updatedPetrol,
  },
});
```

**Important:** `penalty` and `advance` from original record are preserved — not changed during recalculation.

---

## API Routes

### `GET /api/staff/[id]/history`
Returns all confirmed SalaryRecords for this dispatcher with snapshots.

```ts
// Response
Array<{
  salaryRecordId: string
  month: number
  year: number
  netSalary: number
  wasRecalculated: boolean  // updatedAt > createdAt
  weightTiersSnapshot: WeightTierSnapshot[]
  incentiveSnapshot: IncentiveSnapshot
  petrolSnapshot: PetrolSnapshot
}>
```

Ordered by year desc, month desc.
Scoped by `dispatcher.branch.agentId === session.user.id`.

### `POST /api/staff/[id]/recalculate`
Recalculate one past month using updated snapshot values.

```ts
// Request
{
  salaryRecordId: string
  updatedSnapshot: {
    weightTiers?: WeightTierSnapshot[]
    incentive?: IncentiveSnapshot
    petrol?: PetrolSnapshot
  }
}

// Response
{
  success: true
  updatedNetSalary: number
}
```

Validates:
- `salaryRecordId` belongs to this dispatcher
- Dispatcher belongs to logged-in agent
- `SalaryLineItem` rows exist (if not → return error "Cannot recalculate — line items missing")

---

## Files to Create / Modify

| File | Action |
|---|---|
| `src/components/staff/dispatcher-drawer.tsx` | Modify — add History tab |
| `src/components/staff/history-tab.tsx` | Create — history list + expandable rows |
| `src/components/staff/history-month-row.tsx` | Create — single month row with edit panel |
| `src/app/api/staff/[id]/history/route.ts` | Create — GET history |
| `src/app/api/staff/[id]/recalculate/route.ts` | Create — POST recalculate |

---

## Testing

### History Tab
1. Open drawer for dispatcher with no salary records → History tab disabled
2. Open drawer for dispatcher with confirmed records → History tab enabled
3. Click History tab → shows months in descending order
4. Confirmed months show ✅ badge, net salary correct
5. Click "View / Edit" → panel expands with snapshot values
6. Expand another month → previous collapses
7. Click "Cancel" → panel collapses, edits discarded

### Editing + Recalculate
8. Edit incentive amount → "Recalculate" button enables
9. No changes made → "Recalculate" button stays disabled
10. Click "Recalculate" → dialog shows only changed fields
11. Dialog shows correct before/after values
12. Confirm → net salary updates in list, badge changes to 🔄
13. Toast shown with dispatcher name + month
14. Panel collapses automatically
15. "Download Updated Payslip" button appears on recalculated row

### Payslip Download
16. Click "Download Updated Payslip" → PDF downloads
17. PDF shows updated snapshot values (not original)
18. PDF shows correct net salary
19. File named `payslip_[extId]_[month]_[year].pdf`
20. Current staff settings unchanged after recalculation
21. Verify snapshot in DB matches updated values
22. Another agent cannot recalculate dispatcher that isn't theirs (403)
23. Recalculate on record with no line items → error shown

## Status

Not started.
