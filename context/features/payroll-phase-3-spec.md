# Payroll Page — Phase 3: Salary Table + On-Demand Payslip Generation

## Overview

The `/payroll/[uploadId]` page shows the finalized salary table for a confirmed
month. Agent can generate individual or multi-select payslip PDFs on demand.
PDFs are generated using the stored snapshot — always accurate regardless of
future rule changes.

## Expected Outcome

After this phase:
- `/payroll/[uploadId]` shows read-only finalized salary table
- Branch + dispatcher filter on the table
- Checkbox per row for multi-select
- "Generate Payslips" button for selected dispatchers
- Downloads as ZIP of individual PDFs
- File naming: `[branchCode]_[name]_[month]_[year].pdf`
- PDFs use snapshot data — not current staff settings

---

## Route

`/payroll/[uploadId]`

---

## Page Layout

### Header
- Back button → `/payroll`
- Branch + Month Year title: "KPG001 — March 2026"
- "Upload new data" link (triggers re-upload with duplicate warning)

### Filter Bar
- Branch MultiSelect (if upload spans multiple branches — future proofing)
- Dispatcher search — by name or extId
- "Select All" checkbox

### Summary Cards (read-only)
- Total Net Payout (hero)
- Total Base Salary
- Total Incentive
- Total Petrol Subsidy
- Total Deductions

### Salary Table

| Column | Type | Notes |
|---|---|---|
| Checkbox | Multi-select | For bulk payslip generation |
| Dispatcher | Avatar + name + extId | Read-only |
| Total Orders | Integer | Read-only |
| Base Salary | RM | Read-only |
| Incentive | RM | Greyed if 0 |
| Petrol | RM | Greyed if 0 |
| Penalty | RM | Read-only (set during preview) |
| Advance | RM | Read-only (set during preview) |
| Net Salary | RM, bold, primary color | Read-only |

**Note:** Table is fully read-only. To correct penalty/advance → re-upload.

### Multi-Select Payslip Generation

Floating action bar appears when 1+ rows selected:
```
3 dispatchers selected    [Generate Payslips ↓]    [Clear]
```

Clicking "Generate Payslips":
1. `POST /api/payroll/[uploadId]/payslips` with `{ dispatcherIds: [...] }`
2. Server generates PDFs for each selected dispatcher
3. ZIPs them together
4. Returns ZIP download
5. File: `payslips_KPG001_03_2026.zip`
6. Inside ZIP: individual PDFs named `[branchCode]_[name]_[month]_[year].pdf`
   e.g. `KPG001_AhmadFaizal_03_2026.pdf`

---

## Payslip PDF Content

Uses snapshot data — never current staff settings.

```
┌────────────────────────────────────────────────┐
│  EasyStaff                          [Logo]      │
│  Salary Statement                               │
├────────────────────────────────────────────────┤
│  Dispatcher:  Ahmad Faizal                      │
│  ID:          KEP-D001                          │
│  Branch:      KPG001                            │
│  Period:      March 2026                        │
├────────────────────────────────────────────────┤
│  EARNINGS                                       │
│  Base Salary                    RM  3,800.00    │
│    T1 (0–5kg @ RM1.00):  1,240 parcels          │
│    T2 (5–10kg @ RM1.40):   380 parcels          │
│    T3 (10kg+ @ RM2.20):     95 parcels          │
│  Monthly Incentive              RM    300.00    │
│    2,450 orders ≥ 2,000 threshold               │
│  Petrol Subsidy                 RM    120.00    │
│    8 qualifying days ≥ 70 orders/day            │
├────────────────────────────────────────────────┤
│  DEDUCTIONS                                     │
│  Penalty                        RM      0.00   │
│  Advance                        RM      0.00   │
├────────────────────────────────────────────────┤
│  NET SALARY                     RM  4,220.00   │
└────────────────────────────────────────────────┘
```

Data sources:
- Tier breakdown → count `SalaryLineItem` rows per tier using `weightTiersSnapshot`
- Incentive line → `incentiveSnapshot.orderThreshold` + `totalOrders`
- Petrol line → `petrolSnapshot` + qualifying day count from line items
- All RM values → from `SalaryRecord` fields (already calculated)

### PDF Library

```bash
npm install @react-pdf/renderer
```

```ts
// src/lib/payroll/pdf-generator.ts
import { renderToBuffer } from "@react-pdf/renderer";
import { PayslipDocument } from "@/components/payroll/payslip-document";

export async function generatePayslipPDF(data: PayslipData): Promise<Buffer> {
  return await renderToBuffer(<PayslipDocument data={data} />);
}
```

### ZIP Generation

```bash
npm install jszip
```

```ts
import JSZip from "jszip";

const zip = new JSZip();
for (const dispatcher of selectedDispatchers) {
  const pdfBuffer = await generatePayslipPDF(dispatcher);
  const fileName = `${branchCode}_${dispatcher.name.replace(/\s+/g, "")}_${String(month).padStart(2,"0")}_${year}.pdf`;
  zip.file(fileName, pdfBuffer);
}
const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
```

---

## API Routes

### `GET /api/payroll/[uploadId]/salary-records`
Returns all salary records for this upload.
```ts
Array<{
  dispatcherId: string
  dispatcherName: string
  dispatcherExtId: string
  avatarUrl: string | null
  gender: Gender
  totalOrders: number
  baseSalary: number
  incentive: number
  petrolSubsidy: number
  penalty: number
  advance: number
  netSalary: number
}>
```

### `POST /api/payroll/[uploadId]/payslips`
Generate ZIP of PDFs for selected dispatchers.
```ts
// Request: { dispatcherIds: string[] }
// Response: ZIP buffer with correct headers
Content-Type: application/zip
Content-Disposition: attachment; filename="payslips_KPG001_03_2026.zip"
```

---

## Files to Create

| File | Action |
|---|---|
| `src/app/(dashboard)/payroll/[uploadId]/page.tsx` | Create — salary table page |
| `src/components/payroll/salary-table.tsx` | Create — read-only table + checkboxes |
| `src/components/payroll/payslip-document.tsx` | Create — React PDF component |
| `src/components/payroll/payslip-action-bar.tsx` | Create — floating multi-select bar |
| `src/lib/payroll/pdf-generator.ts` | Create — PDF generation |
| `src/lib/payroll/zip-generator.ts` | Create — ZIP packaging |
| `src/lib/payroll/tier-counter.ts` | Create — count parcels per tier |
| `src/app/api/payroll/[uploadId]/salary-records/route.ts` | Create |
| `src/app/api/payroll/[uploadId]/payslips/route.ts` | Create |

---

## Testing

1. Click "View" on history item → navigates to `/payroll/[uploadId]`
2. Summary cards show correct totals
3. All dispatcher rows shown with correct values
4. Table is read-only (no editable inputs)
5. Search by name → filters table
6. Search by extId → filters table
7. Select one dispatcher → floating action bar appears
8. Select all → all checkboxes checked
9. Click "Generate Payslips" with 1 selected → ZIP downloads with 1 PDF
10. Click "Generate Payslips" with 3 selected → ZIP with 3 PDFs
11. ZIP file named `payslips_[branchCode]_[month]_[year].zip`
12. Individual PDFs named `[branchCode]_[name]_[month]_[year].pdf`
13. PDF shows correct dispatcher name, branch, period
14. PDF tier breakdown shows correct parcel counts
15. PDF incentive line shows correct threshold + orders
16. PDF petrol line shows qualifying days
17. PDF net salary matches DB record
18. Change dispatcher rule in Staff → regenerate payslip → still shows snapshot values
19. "Upload new data" → duplicate warning shown

## Status

Not started. Complete Phase 2 first.
