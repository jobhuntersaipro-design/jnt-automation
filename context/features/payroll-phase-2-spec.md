# Payroll Page — Phase 2: Rules Summary + Preview + Confirmation + Snapshots

## Overview

When processing completes (READY_TO_CONFIRM), show a rules summary comparing
current settings against last month's snapshot, then a preview table with
editable penalty/advance. On confirmation, save all salary records with
immutable snapshots of the rules used.

## Expected Outcome

After this phase:
- Rules summary shows what settings will be applied this month
- "Changed since last month" indicators flag differences
- Preview table with editable penalty/advance — net salary recalculates live
- On confirmation, SalaryRecord saved with weightTiersSnapshot, incentiveSnapshot, petrolSnapshot
- Snapshots are immutable — PDF generation always accurate regardless of future rule changes

---

## DB Migration

```prisma
model SalaryRecord {
  // ... existing fields ...
  weightTiersSnapshot  Json
  incentiveSnapshot    Json
  petrolSnapshot       Json
}
```

```bash
npx prisma migrate dev --name add-salary-record-snapshots
```

---

## Step 1 — Rules Summary

Shown first in READY_TO_CONFIRM state.

### Layout

```
Rules Summary — KPG001, March 2026
Review salary rules that will be applied this month.
Changes from last month are highlighted.

DISPATCHER          INCENTIVE      PETROL           CHANGES
Ahmad Faizal        RM 300         ✅ RM15/day       —
Nurul Aina          RM 280         ✅ RM15/day       ⚠ Incentive was RM260
Lim Wei Hong        RM 320         ❌                —
Rajendran Pillai    RM 300         ✅ RM15/day       🆕 New

[View Tiers]    [Proceed to Preview →]
```

### Change Indicators
- `—` no changes
- `⚠ [field] changed (was RM X)` value different from last month snapshot
- `🆕 New` dispatcher not in previous month
- First month ever → "No previous data" note, no indicators

### Change Detection Logic

```ts
function detectChanges(current: DispatcherRules, prev: Snapshot | null): Change[] {
  if (!prev) return [{ type: "NEW" }];
  const changes: Change[] = [];

  if (current.incentiveRule.incentiveAmount !== prev.incentiveSnapshot.incentiveAmount) {
    changes.push({ type: "INCENTIVE_CHANGED",
      from: prev.incentiveSnapshot.incentiveAmount,
      to: current.incentiveRule.incentiveAmount });
  }
  if (current.petrolRule.isEligible !== prev.petrolSnapshot.isEligible) {
    changes.push({ type: "PETROL_ELIGIBILITY_CHANGED" });
  }
  for (const tier of current.weightTiers) {
    const prevTier = prev.weightTiersSnapshot.find(t => t.tier === tier.tier);
    if (prevTier && prevTier.commission !== tier.commission) {
      changes.push({ type: "TIER_CHANGED", tier: tier.tier,
        from: prevTier.commission, to: tier.commission });
    }
  }
  return changes;
}
```

### "View Tiers" Popover
Shows all dispatchers' weight tiers. Changed values highlighted.

### Proceed to Preview
Informational only — agent can proceed regardless of changes.

---

## Step 2 — Preview Table

Shown below rules summary on READY_TO_CONFIRM screen.

### Summary Cards (live-updating)
- Total Net Payout (hero, gradient)
- Total Base Salary
- Total Incentive
- Total Petrol Subsidy
- Total Deductions (penalty + advance)

### Dispatcher Table

| Column | Type | Notes |
|---|---|---|
| Dispatcher | Avatar + name + extId | Read-only |
| Total Orders | Integer | Read-only |
| Base Salary | RM | Read-only |
| Incentive | RM | Greyed if 0 |
| Petrol | RM | Greyed if 0 |
| Penalty | Editable input | Default 0 |
| Advance | Editable input | Default 0 |
| Net Salary | RM | Recalculates live |

Penalty/advance: inline inputs, net salary + summary cards update instantly.
Values stored in Vercel KV until confirmed.

---

## Step 3 — Confirmation

### Dialog

```
Save payroll for KPG001 — March 2026?

Total Net Payout:   RM 42,380.00
Dispatchers:        18
New this month:     1

Salary rules will be locked at current settings.
This cannot be undone without re-uploading.

[Cancel]   [Confirm & Save]
```

### On Confirm — Transaction

```ts
await prisma.$transaction(async (tx) => {
  for (const result of results) {
    const dispatcher = dispatcherMap.get(result.dispatcherId);

    const record = await tx.salaryRecord.create({
      data: {
        dispatcherId: result.dispatcherId,
        uploadId,
        month: upload.month,
        year: upload.year,
        totalOrders: result.totalOrders,
        baseSalary: result.baseSalary,
        incentive: result.incentive,
        petrolSubsidy: result.petrolSubsidy,
        penalty: result.penalty,
        advance: result.advance,
        netSalary: result.netSalary,
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

    await tx.salaryLineItem.createMany({
      data: result.lineItems.map(li => ({
        salaryRecordId: record.id,
        waybillNumber: li.waybillNumber,
        weight: li.weight,
        commission: li.commission,
        deliveryDate: li.deliveryDate,
      })),
    });
  }

  await tx.upload.update({
    where: { id: uploadId },
    data: { status: "SAVED" },
  });
});

await kv.del(`preview:${uploadId}`);
```

If transaction fails → status stays READY_TO_CONFIRM, user can retry.

---

## API Routes

### `GET /api/payroll/[uploadId]/rules-summary`
Current dispatcher rules + diffs vs previous month snapshot.

### `GET /api/payroll/[uploadId]/preview`
Retrieve preview from KV.
```ts
{ results: SalaryResult[]; summary: SummaryTotals }
```

### `PATCH /api/payroll/[uploadId]/preview`
Update penalty/advance in KV.
```ts
// Request: { dispatcherId: string; penalty: number; advance: number }
// Response: { updatedNetSalary: number; updatedSummary: SummaryTotals }
```

### `POST /api/payroll/[uploadId]/confirm`
Save all records with snapshots. Clear KV.
```ts
{ success: true; savedCount: number }
```

---

## Files to Create

| File | Action |
|---|---|
| `src/components/payroll/rules-summary.tsx` | Create — rules table with change indicators |
| `src/components/payroll/preview-table.tsx` | Create — salary preview + editable penalty/advance |
| `src/components/payroll/preview-summary-cards.tsx` | Create — live-updating totals |
| `src/lib/payroll/snapshot.ts` | Create — snapshot builder + change detector |
| `src/app/api/payroll/[uploadId]/rules-summary/route.ts` | Create |
| `src/app/api/payroll/[uploadId]/preview/route.ts` | Create — GET + PATCH |
| `src/app/api/payroll/[uploadId]/confirm/route.ts` | Create |

---

## Testing

1. First upload ever → "No previous data" shown
2. No rule changes → all rows show "—"
3. Incentive changed → ⚠ with previous value
4. Petrol eligibility changed → ⚠ shown
5. Weight tier changed → ⚠ with tier number
6. New dispatcher → 🆕 shown
7. Enter penalty → net salary + cards update instantly
8. Enter advance → same
9. Values persist after leaving + returning (KV)
10. Confirm → SalaryRecord created with all 3 snapshots
11. Verify all snapshot fields correct in DB
12. Change dispatcher rule after confirmation → snapshot unchanged
13. DB failure → status stays READY_TO_CONFIRM
14. KV cleared after confirmation

## Status

Not started. Complete Phase 1 first.
