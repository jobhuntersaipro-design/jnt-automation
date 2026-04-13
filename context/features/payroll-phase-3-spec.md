# Payroll Page — Phase 3: Salary Table + Edit & Recalculate + Payslip Generation

## Overview

The `/payroll/[uploadId]` page shows the finalized salary table for a confirmed
month. Agent can edit any field and recalculate (Option B — full recalculation
using current snapshot rules). Agent can generate individual or multi-select
payslip PDFs on demand. Useful for when J&T sends penalty notices late.

## Expected Outcome

After this phase:
- `/payroll/[uploadId]` shows finalized salary table
- "Edit & Recalculate" mode — opens all fields for editing
- Full recalculation using updated values + current snapshot rules
- Summary cards update live while editing
- Save & Regenerate commits changes to DB + updates snapshots
- Multi-select payslip ZIP download
- PDFs match the client's existing payslip format (ST XIANG style)

---

## Route

`/payroll/[uploadId]`

---

## Page Layout

### Header
- Back button → `/payroll`
- Branch + Month Year: "KPG001 — March 2026"
- "Edit & Recalculate" button (outlined)
- "Upload new data" link

### Filter Bar
- Dispatcher search — by name or extId
- "Select All" checkbox

### Summary Cards
- Total Net Payout (hero)
- Total Base Salary
- Total Incentive
- Total Petrol Subsidy
- Total Deductions
- Updates live during Edit mode

### Salary Table

**Default (read-only) mode:**

| Column | Type |
|---|---|
| Checkbox | Multi-select for payslip generation |
| Dispatcher | Avatar + name + extId |
| Total Orders | Read-only |
| Base Salary | Read-only |
| Incentive | Read-only |
| Petrol | Read-only |
| Penalty | Read-only |
| Advance | Read-only |
| Net Salary | Read-only, bold, primary color |

**Edit mode (after clicking "Edit & Recalculate"):**

All columns become editable:

| Column | Type |
|---|---|
| Checkbox | Same |
| Dispatcher | Read-only |
| Total Orders | Editable input |
| Base Salary | Editable input |
| Incentive | Editable input |
| Petrol | Editable input |
| Penalty | Editable input |
| Advance | Editable input |
| Net Salary | Auto-calculated (base + incentive + petrol - penalty - advance) |

- Net salary column recalculates instantly as any field changes
- Summary cards update live
- "Cancel" button — exits edit mode, discards changes
- "Save & Regenerate" button (primary) — saves all changes

---

## Edit & Recalculate Flow

1. Agent clicks "Edit & Recalculate"
2. Table switches to edit mode — all fields editable
3. Banner shown:
```
⚠ Edit mode — changes will update salary records and snapshots.
  Payslips will reflect the new values after saving.
```
4. Agent updates fields (e.g. penalty for multiple dispatchers)
5. Net salary recalculates live per row
6. Summary cards update live
7. Agent clicks "Save & Regenerate"
8. Confirmation dialog:
```
Save changes for KPG001 — March 2026?

X dispatchers modified.
Total Net Payout: RM XX,XXX.XX (was RM XX,XXX.XX)

This will update salary records and snapshots.
Payslips will reflect the new values.

[Cancel]   [Save & Regenerate]
```
9. Server updates all modified SalaryRecords + snapshots in transaction
10. Table returns to read-only mode with new values
11. Toast: "March 2026 payroll updated"

---

## Save & Regenerate Logic

```ts
// POST /api/payroll/[uploadId]/recalculate
// Request: { updates: Array<{ dispatcherId, totalOrders, baseSalary,
//            incentive, petrolSubsidy, penalty, advance }> }

await prisma.$transaction(async (tx) => {
  for (const update of updates) {
    const netSalary = update.baseSalary + update.incentive
      + update.petrolSubsidy - update.penalty - update.advance;

    // Rebuild snapshots from current values
    const dispatcher = await tx.dispatcher.findUnique({
      where: { id: update.dispatcherId },
      include: { weightTiers: true, incentiveRule: true, petrolRule: true },
    });

    await tx.salaryRecord.update({
      where: { dispatcherId_uploadId: { dispatcherId: update.dispatcherId, uploadId } },
      data: {
        totalOrders: update.totalOrders,
        baseSalary: update.baseSalary,
        incentive: update.incentive,
        petrolSubsidy: update.petrolSubsidy,
        penalty: update.penalty,
        advance: update.advance,
        netSalary,
        // Rebuild snapshots from current dispatcher rules
        weightTiersSnapshot: dispatcher.weightTiers.map(t => ({
          tier: t.tier, minWeight: t.minWeight,
          maxWeight: t.maxWeight, commission: t.commission,
        })),
        incentiveSnapshot: {
          orderThreshold: dispatcher.incentiveRule.orderThreshold,
          incentiveAmount: dispatcher.incentiveRule.incentiveAmount,
        },
        petrolSnapshot: {
          isEligible: dispatcher.petrolRule.isEligible,
          dailyThreshold: dispatcher.petrolRule.dailyThreshold,
          subsidyAmount: dispatcher.petrolRule.subsidyAmount,
        },
      },
    });
  }
});
```

---

## Payslip PDF Format

Matches client's existing ST XIANG payslip format exactly.

### Company header (from Agent settings)
```
[Company Name] ([Registration Number])
[Address Line 1]
[Address Line 2]
```

### Employee particulars
```
NAME:      [Dispatcher Name]        DATE:          [Month Year]
I/C NO:    [IC Number]              SOCSO NO:      (blank)
POSITION:  DESPATCH                 INCOME TAX NO: (blank)
```

### Addition / Deduction table
```
ADDITION                    RM    DEDUCTION        RM
Parcel Delivered            7,286.40  PENALTY      1,160.00
  (6624*RM 1.1)
Parcel Delivered              170.80  ADVANCE      3,928.90
  (122*RM 1.4)
Parcel Delivered              138.00
  (60*RM 2.3)
Incentive                     300.00
Petrol Subsidy                120.00

TOTAL:-                     7,995.20
EMPLOYER'S CONTRIBUTION           NET PAY:-        2,506.30

REMARKS:-
```

- Incentive line only shown if `incentive > 0`
- Petrol Subsidy line only shown if `petrolSubsidy > 0`
- Both included in TOTAL calculation

### Footer
```
PREPARED BY                    APPROVED BY
.......................         .......................
```
- Company stamp image (uploaded per agent — stored in R2)

### PDF data sources
- Company name/address/reg → from `Agent` model (new fields needed)
- Dispatcher name/IC → from `Dispatcher` model
- Tier breakdown → count `SalaryLineItem` rows per tier using `weightTiersSnapshot`
- Rate format → `1.1` not `1.10` (strip trailing zero)
- Penalty/advance → from `SalaryRecord`
- Net pay → `SalaryRecord.netSalary`

### Agent model additions needed
```prisma
model Agent {
  // ... existing fields ...
  companyRegistrationNo  String?
  companyAddress         String?
  stampImageUrl          String?  // R2 URL for company stamp
}
```

---

## Multi-Select Payslip Generation

Floating action bar when 1+ rows selected:
```
3 dispatchers selected    [Generate Payslips ↓]    [Clear]
```

- `POST /api/payroll/[uploadId]/payslips` with `{ dispatcherIds: [...] }`
- Server generates PDFs + ZIPs
- File: `payslips_KPG001_03_2026.zip`
- Individual PDFs: `[branchCode]_[name]_[month]_[year].pdf`

---

## API Routes

### `GET /api/payroll/[uploadId]/salary-records`
All salary records for this upload.

### `POST /api/payroll/[uploadId]/recalculate`
Update + recalculate selected dispatchers.
```ts
// Request
{ updates: Array<{ dispatcherId, totalOrders, baseSalary,
  incentive, petrolSubsidy, penalty, advance }> }
// Response
{ success: true; updatedCount: number }
```

### `POST /api/payroll/[uploadId]/payslips`
Generate ZIP of PDFs.
```ts
// Request: { dispatcherIds: string[] }
// Response: ZIP buffer
```

---

## Files to Create / Modify

| File | Action |
|---|---|
| `src/app/(dashboard)/payroll/[uploadId]/page.tsx` | Create — salary table page |
| `src/components/payroll/salary-table.tsx` | Create — table with read/edit modes |
| `src/components/payroll/edit-mode-banner.tsx` | Create — warning banner in edit mode |
| `src/components/payroll/payslip-document.tsx` | Create — React PDF matching ST XIANG format |
| `src/components/payroll/payslip-action-bar.tsx` | Create — floating multi-select bar |
| `src/lib/payroll/pdf-generator.ts` | Create — PDF generation |
| `src/lib/payroll/zip-generator.ts` | Create — ZIP packaging |
| `src/lib/payroll/tier-counter.ts` | Create — count parcels per tier |
| `src/app/api/payroll/[uploadId]/salary-records/route.ts` | Create |
| `src/app/api/payroll/[uploadId]/recalculate/route.ts` | Create |
| `src/app/api/payroll/[uploadId]/payslips/route.ts` | Create |

---

## Testing

### Salary Table
1. Click "View" → navigates to `/payroll/[uploadId]`
2. All values correct and read-only
3. Search filters table correctly

### Edit & Recalculate
4. Click "Edit & Recalculate" → edit mode, banner shown
5. Edit penalty for one dispatcher → net salary updates instantly
6. Edit advance → net salary updates, summary cards update
7. Edit base salary → net salary recalculates
8. Click "Cancel" → all edits discarded, read-only mode restored
9. Click "Save & Regenerate" → confirmation dialog shows correct diff
10. Confirm → DB updated, read-only mode with new values
11. Toast shown
12. Re-open page → new values persist
13. DB failure → transaction rolls back, values unchanged

### Payslips
14. Select 1 dispatcher → action bar appears
15. Select all → all checked
16. Generate Payslips → ZIP downloads
17. PDF matches ST XIANG format exactly
18. Company name/address/reg in header
19. IC number in employee particulars
20. Tier breakdown shows correct count*rate format (1.1 not 1.10)
21. Penalty + advance in deductions
22. Net pay correct
23. After recalculate → regenerate payslip → shows updated values

## Status

Not started. Complete Phase 2 first.
