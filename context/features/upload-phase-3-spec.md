# Upload Phase 3: New Dispatcher Setup + Process Unknown

## Overview

Handle the NEEDS_ATTENTION state where unknown dispatchers were found in the
Excel file. Agent sets up unknown dispatchers from a modal without leaving
the Payroll page. After setup, only unknown dispatchers are processed and
merged with existing results.

## Expected Outcome

After this phase:
- NEEDS_ATTENTION state shows partial results + setup modal
- Agent sets up unknown dispatchers inline
- Only unknown dispatchers reprocessed after setup
- Results merged with already-calculated known dispatchers
- Status moves to READY_TO_CONFIRM
- No full reprocessing — known dispatcher results preserved in KV

---

## NEEDS_ATTENTION State — Payroll Page

```
┌──────────────────────────────────────────────┐
│  ⚠  2 new dispatchers require setup         │
│  16 of 18 dispatchers already processed.     │
│  [Setup New Dispatchers]                     │
└──────────────────────────────────────────────┘

[Partial results table — read only, 16 dispatchers]
```

Two buttons:
- "Setup New Dispatchers" → opens modal
- "Review Processed (16)" → scrolls to partial results table

---

## New Dispatcher Setup Modal

Lists all unknown dispatchers from `Upload.errorMessage`.

**Per dispatcher (collapsible section):**
| Field | Mandatory | Default |
|---|---|---|
| Name | Read-only (from Excel) | — |
| Dispatcher ID | Read-only (from Excel) | — |
| IC Number | ✅ | — |
| Branch | Read-only (from upload) | — |
| T1: 0–5kg Commission | ✅ | RM 1.00 |
| T2: 5–10kg Commission | ✅ | RM 1.40 |
| T3: 10kg+ Commission | ✅ | RM 2.20 |
| Incentive Threshold | ✅ | 2000 |
| Incentive Amount | ✅ | (must fill) |
| Petrol Eligible | ✅ | false |
| Petrol Threshold (if eligible) | ✅ | 70 |
| Petrol Amount (if eligible) | ✅ | 15 |

**UI:**
- Each dispatcher collapsed by default — expand to fill
- Section header shows name + ID + completion indicator (● / ○)
- "Save & Process" disabled until all dispatchers complete
- Closing modal without saving → stays NEEDS_ATTENTION

**On "Save & Process":**
1. `POST /api/upload/[uploadId]/setup-dispatchers` — creates dispatchers in DB
2. `POST /api/upload/[uploadId]/process-unknown` — calculates only new dispatchers
3. Merges results with existing KV preview
4. Status → READY_TO_CONFIRM
5. Modal closes automatically

---

## API Routes

### `POST /api/upload/[uploadId]/setup-dispatchers`
Create new dispatchers + seed rules in a single transaction.

```ts
// Request
{
  dispatchers: Array<{
    extId: string
    name: string
    icNo: string
    branchId: string
    weightTiers: WeightTierInput[]
    incentiveRule: { orderThreshold: number; incentiveAmount: number }
    petrolRule: { isEligible: boolean; dailyThreshold: number; subsidyAmount: number }
  }>
}
// Response
{ success: true; createdCount: number }
```

### `POST /api/upload/[uploadId]/process-unknown`
Run calculator only for newly created dispatchers.
Retrieve parsed rows from KV (`parsed:{uploadId}`).
Merge results into existing KV preview (`preview:{uploadId}`).
Set status READY_TO_CONFIRM.
Response: `{ status: "READY_TO_CONFIRM" }`

---

## Files to Create

| File | Action |
|---|---|
| `src/components/payroll/new-dispatcher-modal.tsx` | Create — setup form |
| `src/app/api/upload/[uploadId]/setup-dispatchers/route.ts` | Create |
| `src/app/api/upload/[uploadId]/process-unknown/route.ts` | Create |
| `src/lib/upload/pipeline.ts` | Modify — add processUnknown function |

---

## Testing

1. File with unknown dispatcher → NEEDS_ATTENTION shown
2. "Setup New Dispatchers" → modal opens with unknown dispatcher list
3. Fill all mandatory fields → section shows ● complete
4. Leave incentive amount empty → "Save & Process" stays disabled
5. Complete all → "Save & Process" enabled
6. Click → dispatchers created, processing runs, status → READY_TO_CONFIRM
7. Verify new dispatcher in Staff page with correct rules
8. Verify known dispatcher results preserved in KV (not recalculated)
9. Unknown dispatcher results merged correctly
10. Close modal without saving → stays NEEDS_ATTENTION
11. File with 2 unknown + 16 known → partial table shows 16, modal shows 2

## Status

Not started. Complete Phase 2 first.
