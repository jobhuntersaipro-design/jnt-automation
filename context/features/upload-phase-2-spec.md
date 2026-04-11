# Upload Phase 2: Excel Parsing + Confirm Settings + Salary Calculation

## Overview

The QStash worker parses the Excel file, splits known vs unknown dispatchers,
sets status to CONFIRM_SETTINGS so the agent can verify rules before calculating,
then runs the salary calculation engine after confirmation.

## Expected Outcome

After this phase:
- Worker parses Excel correctly from R2
- Known vs unknown dispatchers split — known don't block unknown
- Status set to CONFIRM_SETTINGS → agent reviews settings before calculation
- After agent confirms → calculation runs for known dispatchers
- Unknown dispatchers flagged separately
- Preview results stored in Vercel KV
- Unit tests cover all salary calculation scenarios

---

## New Dependencies

```bash
npm install exceljs @vercel/kv
```

```env
KV_URL=
KV_REST_API_URL=
KV_REST_API_TOKEN=
KV_REST_API_READ_ONLY_TOKEN=
```

Add Vercel KV from Vercel dashboard → Storage → Create KV Database.

---

## Processing Pipeline

### Phase A — Parse + Split (runs in QStash worker)

```ts
export async function processUpload(uploadId: string) {
  try {
    await setUploadStatus(uploadId, "PROCESSING");

    const upload = await prisma.upload.findUnique({
      where: { id: uploadId },
      include: { branch: { select: { agentId: true, code: true } } },
    });

    // 1. Parse Excel from R2
    const rows = await parseExcelFile(upload.r2Key);

    // 2. Split known vs unknown
    const { known, unknown } = await splitDispatchers(rows, upload.branch.agentId);

    // 3. Store parsed rows in KV for later calculation
    await kv.set(`parsed:${uploadId}`, JSON.stringify({ rows, known, unknown }), { ex: 7200 });

    // 4. Set status — always CONFIRM_SETTINGS first
    await setUploadStatus(uploadId, "CONFIRM_SETTINGS", {
      knownCount: known.length,
      unknownDispatchers: unknown,
    });

  } catch (error) {
    await setUploadStatus(uploadId, "FAILED", {
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
```

### Phase B — Calculate (runs after agent confirms settings)

```ts
export async function calculateAfterConfirm(uploadId: string) {
  const cached = await kv.get(`parsed:${uploadId}`);
  const { rows, known } = JSON.parse(cached);

  const dispatchers = await getDispatchersWithRules(known, agentId);
  const results = dispatchers.map(d =>
    calculateSalary(d, rows.filter(r => r.dispatcherId === d.extId))
  );

  await kv.set(`preview:${uploadId}`, JSON.stringify(results), { ex: 3600 });
  await setUploadStatus(uploadId, "READY_TO_CONFIRM");
}
```

---

## Excel File Structure

| Column | Field |
|---|---|
| A | Waybill Number |
| K | Branch Name |
| L | Delivery Date |
| M | Dispatcher ID (extId) |
| N | Dispatcher Name |
| Q | Billing Weight (kg) |

**Edge cases:**
- Empty rows → skip
- billingWeight as string → strip non-numeric, parse float
- deliveryDate as Excel serial → use exceljs date conversion
- Select "sheet1" explicitly — file has 60+ sheets (one per dispatcher)
   const ws = workbook.getWorksheet("sheet1") ?? workbook.worksheets[0];
- dispatcherId empty → skip row

---

## Known vs Unknown Split

```ts
const allExtIds = [...new Set(rows.map(r => r.dispatcherId))];
const known = await prisma.dispatcher.findMany({
  where: { branch: { agentId }, extId: { in: allExtIds } },
  select: { extId: true },
});
const knownIds = new Set(known.map(d => d.extId));

return {
  known: allExtIds.filter(id => knownIds.has(id)),
  unknown: allExtIds
    .filter(id => !knownIds.has(id))
    .map(id => ({
      extId: id,
      name: rows.find(r => r.dispatcherId === id)?.dispatcherName ?? "Unknown",
    })),
};
```

---

## Salary Calculation Engine

### `src/lib/upload/calculator.ts`

**Step 1 — Base Salary:**
```ts
const baseSalary = deliveries.reduce((sum, d) => {
  const tier = tiers.find(t =>
    d.billingWeight >= t.minWeight &&
    (t.maxWeight === null || d.billingWeight <= t.maxWeight)
  );
  return sum + (tier?.commission ?? 0);
}, 0);
```

**Step 2 — Incentive:**
```ts
const incentive = totalOrders >= incentiveRule.orderThreshold
  ? incentiveRule.incentiveAmount : 0;
```

**Step 3 — Petrol Subsidy:**
```ts
let petrolSubsidy = 0;
if (petrolRule.isEligible) {
  const byDate = groupBy(deliveries, d => d.deliveryDate.toDateString());
  for (const dayDeliveries of Object.values(byDate)) {
    if (dayDeliveries.length >= petrolRule.dailyThreshold) {
      petrolSubsidy += petrolRule.subsidyAmount;
    }
  }
}
```

**Step 4 — Net Salary:**
```ts
const netSalary = baseSalary + incentive + petrolSubsidy;
// penalty + advance = 0 here, set in preview
```

---

## CONFIRM_SETTINGS State — Payroll Page

When status is `CONFIRM_SETTINGS`, Payroll page shows:

```
┌──────────────────────────────────────────────┐
│  ✓ File parsed successfully                  │
│  18 dispatchers found (16 known, 2 new)      │
│                                              │
│  Before calculating salaries, please confirm │
│  that staff settings are up to date for      │
│  March 2026.                                 │
│                                              │
│  [Review Staff Settings ↗]                   │
│                                              │
│  [Use Current Settings & Calculate →]        │
└──────────────────────────────────────────────┘
```

- "Review Staff Settings" → opens `/staff` in new tab
- "Use Current Settings & Calculate" → calls `POST /api/upload/[uploadId]/calculate`
  → triggers Phase B calculation → status moves to NEEDS_ATTENTION or READY_TO_CONFIRM

---

## Unit Tests

### `src/lib/upload/__tests__/calculator.test.ts`

```ts
// Weight tier boundary tests
it("assigns tier 1 for weight exactly at boundary (5.00kg)")
it("assigns tier 2 for weight just above boundary (5.01kg)")
it("assigns tier 3 for weight above 10kg")
it("returns 0 commission if no tier matches")

// Incentive tests
it("applies incentive when orders meet threshold exactly")
it("applies incentive when orders exceed threshold")
it("does not apply incentive when orders below threshold")

// Petrol tests
it("applies subsidy for each qualifying day")
it("applies subsidy for multiple qualifying days")
it("does not apply subsidy if not eligible")
it("does not apply subsidy if daily orders below threshold")
it("does not double-count same-day deliveries")

// Net salary tests
it("calculates net salary with all components")
it("handles zero incentive and zero petrol")
it("handles penalty deduction")
it("handles advance deduction")
```

---

## API Routes

### `POST /api/upload/[uploadId]/calculate`
Trigger Phase B — runs after agent confirms settings.
Sets status PROCESSING → runs calculation → sets NEEDS_ATTENTION or READY_TO_CONFIRM.
Response: `{ success: true }`

---

## Files to Create

| File | Action |
|---|---|
| `src/lib/upload/parser.ts` | Create — Excel parsing |
| `src/lib/upload/calculator.ts` | Create — salary calculation engine |
| `src/lib/upload/dispatcher-check.ts` | Create — known vs unknown split |
| `src/lib/upload/pipeline.ts` | Create — Phase A + Phase B orchestration |
| `src/lib/upload/__tests__/calculator.test.ts` | Create — Vitest unit tests |
| `src/app/api/upload/[uploadId]/calculate/route.ts` | Create — trigger Phase B |
| `src/app/api/upload/worker/route.ts` | Modify — wire up processUpload |

---

## Testing

1. Upload valid Excel → parses without error
2. Correct dispatcher IDs from column M
3. Correct billing weights from column Q
4. Correct delivery dates from column L
5. Status → CONFIRM_SETTINGS after parsing
6. "Review Staff Settings" opens /staff in new tab
7. Click "Use Current Settings" → calculation starts
8. Known dispatchers calculated, unknown flagged
9. Status → NEEDS_ATTENTION if unknown exist
10. Status → READY_TO_CONFIRM if all known
11. Base salary matches manual calculation
12. Incentive applied correctly
13. Petrol subsidy per qualifying day
14. Exception mid-process → status FAILED
15. All Vitest tests pass

## Status

Not started. Complete Phase 1 first.
