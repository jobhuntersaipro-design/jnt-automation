# Incentive Tiers — Restructure + Payroll UX + PDF Perf

## Overview

Replace the current flat-amount incentive (RM200 once a dispatcher crosses
`orderThreshold`) with a **second set of per-parcel weight tiers** that
applies only to parcels **after** the threshold is crossed. Tier-boosted
earnings roll up into `baseSalary`.

Bundle three payroll UX affordances for "high performer" dispatchers and
one infra fix for an unusably-slow month-detail PDF endpoint.

Scope is one feature branch (`feature/incentive-tiers`), one Prisma
migration, one historical recompute script, one PDF rewrite.

---

## 1. The Incentive Model (Current → New)

### Current (flat bonus)

```
IncentiveRule { orderThreshold: 2000, incentiveAmount: 200 }

totalOrders = 2340
→ incentive = 200 (flat; the extra 340 parcels don't earn more)
```

### New (Option B — weight-tier boost, post-threshold)

```
IncentiveRule { orderThreshold: 2000 }
IncentiveTier[1] { minWeight: 0,     maxWeight: 5,    commission: 1.50 }
IncentiveTier[2] { minWeight: 5.01,  maxWeight: 10,   commission: 2.10 }
IncentiveTier[3] { minWeight: 10.01, maxWeight: null, commission: 3.30 }

Parcels sorted by (deliveryDate asc, waybillNumber asc) — stable.
Parcels 1..2000     → priced at WeightTier rate
Parcels 2001..2340  → priced at IncentiveTier rate (still by weight)

baseSalary    = Σ commission(parcels 1..2000, WeightTier)
incentive     = Σ commission(parcels 2001..N, IncentiveTier)
netSalary     = baseSalary + incentive + petrolSubsidy − penalty − advance
```

**Key rules:**

1. Ordering is **stable** — `deliveryDate` ascending, then `waybillNumber`
   ascending as tiebreaker. Parcels with `deliveryDate = null` sort
   **last** (they can't unambiguously be placed in the first 2000).
2. `orderThreshold` is `≥` — e.g. threshold 2000 means parcel **#2001 and
   beyond** earn the boost. Parcel 2000 is still base.
3. If `totalOrders ≤ orderThreshold`, `incentive = 0` and every parcel is
   priced at the `WeightTier` rate — identical to today's behaviour for
   non-high-performers.
4. If `IncentiveTier[]` has no matching tier for a parcel's weight,
   commission falls back to **0** (same behaviour as `getCommission` today
   for `WeightTier`). No implicit fallback to the weight-tier rate.
5. `SalaryRecord.incentive` keeps its column name but its **semantics
   change**: was "flat bonus", now "post-threshold tier earnings". No
   rename to avoid 30+ call-site touches.
6. `SalaryRecord.baseSalary` still means "everything before deductions
   and petrol" and is displayed in UI under "Base Salary" — the
   high-performer boost appears in "Incentive".

> I considered folding both into one `baseSalary` number as the user
> literally asked ("add in to the base salary") but keeping them split
> preserves the existing dashboards, exports, and summary cards
> untouched, and the "Incentive" header now reads as the high-performer
> bonus which is arguably clearer. **Open question 1** — confirm.

---

## 2. Data Model Changes

### Prisma schema

```prisma
model Dispatcher {
  // ...existing fields
  weightTiers     WeightTier[]
  incentiveRule   IncentiveRule?
  incentiveTiers  IncentiveTier[]    // NEW
  petrolRule      PetrolRule?
}

model IncentiveRule {
  id             String     @id @default(cuid())
  dispatcherId   String     @unique
  orderThreshold Int        @default(2000)
  // incentiveAmount REMOVED
  dispatcher     Dispatcher @relation(fields: [dispatcherId], references: [id], onDelete: Cascade)
}

// NEW — mirrors WeightTier exactly
model IncentiveTier {
  id           String     @id @default(cuid())
  dispatcherId String
  tier         Int        // 1, 2, or 3
  minWeight    Float
  maxWeight    Float?     // null = no upper bound (last tier)
  commission   Float
  dispatcher   Dispatcher @relation(fields: [dispatcherId], references: [id], onDelete: Cascade)

  @@unique([dispatcherId, tier])
  @@index([dispatcherId])
}

model AgentDefault {
  // ...existing fields (weightTier defaults)
  incentiveOrderThreshold  Int    @default(2000)
  incentiveTier1Commission Float  @default(1.50)  // NEW
  incentiveTier2Commission Float  @default(2.10)  // NEW
  incentiveTier3Commission Float  @default(3.30)  // NEW
  // incentiveAmount REMOVED
}
```

### Migration (`20260423_incentive_tiers`)

One Prisma migration, three SQL phases inside it:

1. **Create** `IncentiveTier` table.
2. **Backfill** three rows per existing dispatcher using the same
   `minWeight`/`maxWeight` boundaries as their `WeightTier` rows, with
   commissions `1.50 / 2.10 / 3.30` (agent-editable afterwards via the
   existing Defaults drawer).
3. **Drop** `IncentiveRule.incentiveAmount` and
   `AgentDefault.incentiveAmount`.

> **Rule (from CLAUDE.md):** no `prisma db push` — write the migration,
> test with `prisma migrate dev` on the `development` Neon branch, apply
> to prod with `prisma migrate deploy` after merge.

### Snapshot shape

`SalaryRecord.incentiveSnapshot` is `Json?`. Today it stores
`{ orderThreshold, incentiveAmount }`. Change to:

```ts
{
  orderThreshold: number;
  tiers: Array<{
    tier: number;
    minWeight: number;
    maxWeight: number | null;
    commission: number;
  }>;
}
```

Old-shape snapshots on **re-computed** records get overwritten in the
recompute script (§4). Old-shape snapshots on records **skipped** by the
recompute (see §4) stay as-is — read-path code that touches
`incentiveSnapshot` needs a discriminated reader:

```ts
function readIncentiveSnapshot(snap: unknown): {
  orderThreshold: number;
  tiers: IncentiveTierInput[] | null;   // null = legacy flat
  legacyAmount: number | null;          // only set for legacy snapshots
}
```

Only two read-paths use `incentiveSnapshot` today (`rules-summary` route
and the history drawer). Both need that reader.

---

## 3. Salary Calculator

File: `src/lib/upload/calculator.ts`

### New input types

```ts
export interface IncentiveTierInput {
  tier: number;
  minWeight: number;
  maxWeight: number | null;
  commission: number;
}

export interface IncentiveRuleInput {
  orderThreshold: number;
  // incentiveAmount removed
}

export interface DispatcherRules {
  dispatcherId: string;
  extId: string;
  weightTiers: WeightTierInput[];
  incentiveRule: IncentiveRuleInput;
  incentiveTiers: IncentiveTierInput[];   // NEW
  petrolRule: PetrolRuleInput;
}
```

### New `LineItem` field

```ts
export interface LineItem {
  waybillNumber: string;
  weight: number;
  commission: number;        // effective rate actually applied
  deliveryDate: Date | null;
  isIncentive: boolean;      // NEW — true when this parcel was priced at IncentiveTier
}
```

`isIncentive` persists to a new column on `SalaryLineItem` — see §5. It
drives the highlight in §7.

### Algorithm

```ts
export function calculateSalary(d, deliveries): SalaryResult {
  // 1. Sort stable: deliveryDate asc, null last, waybillNumber asc as tiebreaker
  const sorted = stableSort(deliveries);

  // 2. Price each parcel
  const { orderThreshold } = d.incentiveRule;
  const lineItems = sorted.map((row, idx) => {
    const isIncentive = idx >= orderThreshold;              // 0-based: #2001 = idx 2000
    const tiers = isIncentive ? d.incentiveTiers : d.weightTiers;
    const commission = getCommission(row.billingWeight, tiers);
    return { ...row, commission, isIncentive };
  });

  // 3. Roll up
  const baseSalary = sum(lineItems.filter(li => !li.isIncentive).map(li => li.commission));
  const incentive  = sum(lineItems.filter(li =>  li.isIncentive).map(li => li.commission));

  // 4. Petrol unchanged
  // 5. netSalary = base + incentive + petrol − penalty − advance
}
```

`getCommission` is unchanged — already tier-agnostic.

---

## 4. Historical Re-computation

User confirmed: **re-compute all existing `SalaryRecord` rows** using the
new model and new default incentive tiers (1.50 / 2.10 / 3.30).

### Script

`scripts/recompute-incentive-tiers.ts` — mirrors
`scripts/person-identity-backfill.ts` pattern. `--dry-run` default,
`--confirm` to execute. Per-record transaction. Idempotent.

```
for each SalaryRecord r where incentiveSnapshot is the legacy shape:
  load r.lineItems, r.dispatcher.incentiveTiers, r.dispatcher.incentiveRule
  if no incentiveTiers seeded → skip (log) — migration should have seeded them
  recompute with new calculator
  update: baseSalary, incentive, netSalary, weightTiersSnapshot,
          incentiveSnapshot (new shape), lineItems.isIncentive
```

### Safety

- Dev Neon branch **first**. Diff report (markdown to
  `docs/audit-results/incentive-recompute-YYYYMMDD.md`) lists every
  record whose `netSalary` moved > RM1 vs the stored value.
- Prod Neon rollback branch (snapshot `pre-incentive-tiers-YYYYMMDD`)
  **before** running with `--confirm`.
- **Skip** records with `penalty > 0` or `advance > 0` — those were
  manually edited by the user and we don't want to blow away their work.
  They stay on the legacy snapshot shape. (The discriminated snapshot
  reader in §2 handles them.) **Open question 5** — is this skip rule
  right? Or always overwrite base/incentive/net and preserve just
  penalty/advance? I recommend the latter because it's what the user
  asked ("re-compute"), but want to confirm before executing against
  prod.
- Recompute runs **after** the migration's tier-backfill, so every
  dispatcher has incentive tiers by the time we touch records.

### No impact on confirmed payroll workflow

- `SalaryRecord.updatedAt` advances → `wasRecalculated = true` → rows
  display the "Recalculated" pill in the existing payroll UI. That's
  the expected signal to the agent that something changed.
- The upload pipeline is unaffected going forward — new uploads use the
  new calculator from day one.

---

## 5. `SalaryLineItem.isIncentive`

Add a `Boolean @default(false)` column on `SalaryLineItem`. Same
migration as §2.

```prisma
model SalaryLineItem {
  // ...existing
  isIncentive Boolean @default(false)
}
```

- Write path: `pipeline.ts` + recompute script set it via
  `createMany({ data })`.
- Read path: the line-item detail route (§7b) reads it directly — no
  client-side cumulative counting.
- Existing legacy rows default `false`; they get flipped by the
  recompute script for records that hit the threshold.

---

## 6. UI A — Salary table at `/dispatchers/payroll/[uploadId]`

File: `src/components/payroll/salary-table.tsx`.

### A1. "High Performer" badge beside dispatcher name

Row-level. Render when `record.totalOrders > record.incentiveSnapshot.orderThreshold`
(strict `>`, same as the calculator's threshold semantic — #2001+ means
`totalOrders > 2000`).

```tsx
<DispatcherName />
{isHighPerformer && (
  <Tooltip content={`Dispatched over ${threshold.toLocaleString()} orders`}>
    <span className="badge badge-brand">High Performer</span>
  </Tooltip>
)}
```

- Style: `bg-brand/10 text-brand border-brand/20 rounded-md px-2 py-0.5
  text-[11px] font-medium uppercase tracking-wide` — matches existing
  "Recalculated" pill vocabulary.
- Icon: `TrendingUp` (lucide) prefix, optional.
- Tooltip: use the existing tooltip primitive from
  `src/components/ui/tooltip.tsx` (Radix). Content dynamic:
  `Dispatched over {threshold.toLocaleString()} orders`.

### A2. Status filter pill — "High Performer"

Today the status pills are `All / Ready / Review / Zero / Edited`. Add a
sixth **orthogonal** filter (not part of `StatusFilter`) — a separate
toggle to the right of the pill row, visually distinct:

```
[All 320] [Ready 280] [Review 12] [Zero 0] [Edited 8]   |  [⭐ High Performers 24]
```

Why orthogonal: a record can be both `"ready"` and `"high performer"`.
Treating it as a 6th mutually-exclusive pill forces the user to pick
one.

Implementation: `const [highPerformerOnly, setHighPerformerOnly] =
useState(false)`; the `filtered` memo ANDs it with the existing status
filter.

### A3. Count in the filter

`24` above = `records.filter(isHighPerformer).length`. Computed in the
same memo that computes status counts (`counts` today).

---

## 7. UI B — Line-item detail at `/dispatchers/history/[salaryRecordId]`

File: `src/app/(dashboard)/dispatchers/history/[salaryRecordId]/page.tsx`
and its underlying data loader `src/lib/db/staff.ts → getMonthDetail`.

### B1. Highlight post-threshold rows

Every `SalaryLineItem` row now has `isIncentive: boolean`. Render:

```tsx
<tr className={li.isIncentive ? "bg-brand/5 border-l-2 border-brand" : ""}>
  ...
  <td>{li.weight}</td>
  <td>{formatRM(li.commission)}</td>  {/* already shows different rate */}
  {li.isIncentive && <span className="text-xs text-brand">Incentive</span>}
</tr>
```

Left border accent echoes the design-system "critical accent trace"
pattern from the summary cards. Background tint + brand colour is safe
in light mode; dark-mode contrast is fine because `bg-brand/5` is
near-transparent.

### B2. Tier breakdown — expand to 6 rows

`buildTierBreakdown` in `src/lib/staff/month-detail.ts` today produces
3 rows (T1/T2/T3 over `WeightTier`). Extend to 6:

```
Base     T1 Range  Rate  Orders  Weight  Subtotal
Base     T2 ...
Base     T3 ...
───────────────────────────────────────────────
Incentive T1 ...
Incentive T2 ...
Incentive T3 ...
───────────────────────────────────────────────
                                         TOTAL
```

Only render the "Incentive" rows when `record.incentive > 0`. Signature
change — `buildTierBreakdown` now takes `(lineItems, weightTiers,
incentiveTiers)` and returns `{ base: TierBreakdownRow[]; incentive:
TierBreakdownRow[] }`. The PDF and HTML both consume this same
structure.

### B3. Summary header — add "Incentive Earnings"

Four-cell summary today: Orders / Weight / Base / Net. Add a fifth:
**Incentive** (hidden when 0).

---

## 8. PDF Performance

### Problem

`@react-pdf/renderer` renders a React VDOM to PDF **synchronously** in
Node. For a single high-performer month (~2500 parcels) it blocks the
request for 30–90 s and often OOMs the serverless function. Not
streamable. Observed symptom: request hangs indefinitely, browser
eventually times out.

### Decision

Replace `@react-pdf/renderer` with **`pdfkit`** behind the same
`generateMonthDetailPdf` signature (return `Buffer`, same inputs). Keep
the existing route as an attachment-disposition synchronous response.

### Why `pdfkit` and not the bulk-job pattern

- `pdfkit` is imperative, not VDOM — 5–10× faster for large tables
  (benchmarks show ~3000 rows in 1–2 s vs 30 s+).
- Streamable — we can pipe directly to `NextResponse`.
- Already in the project's dep tree (indirectly via exceljs? or no, need
  to add). **Open question 3** — confirm we're OK with adding `pdfkit`.
- The bulk-job pattern already exists for **bulk** exports. A single
  dispatcher's single month should not require async fire-and-wait UX.

### Streaming the response

```ts
export async function GET(...) {
  const stream = new PassThrough();
  const doc = new PDFDocument({ size: "A4" });
  doc.pipe(stream);
  renderMonthDetail(doc, data);   // imperative, NOT VDOM
  doc.end();

  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
```

Node `Readable` → Web `ReadableStream` conversion via
`Readable.toWeb(stream)` (Node 18+).

### Escape hatch (follow-up, not in this spec)

If a dispatcher ever has >10,000 parcels in a month, fall back to the
existing `bulk-job.ts` pattern. Not needed now — today's max is ~3000.

### Files changed

- `src/lib/staff/month-detail-pdf.ts` — full rewrite using `pdfkit`.
  Keeps the same export signature + layout (Courier body, tier header,
  per-row numbering, running page totals, TOTAL footer).
- `package.json` — add `pdfkit` + `@types/pdfkit`. **Remove**
  `@react-pdf/renderer` only if no other callers (check
  `src/lib/pdf/summary-table.tsx` + payslip gen — both still use it, so
  **keep** `@react-pdf/renderer` for now; only the month-detail PDF
  switches).
- `src/app/api/staff/[id]/history/[salaryRecordId]/export/pdf/route.ts`
  — switch from `renderToBuffer` + `Uint8Array` to streamed response.
- `src/lib/staff/bulk-export-worker.ts` — consumes the same
  `generateMonthDetailPdf(data): Buffer` so it gets the speedup for
  free.

### Highlight in the PDF

The highlight requirement in §7b applies to the PDF too. Post-threshold
rows get a light-grey or brand-tinted background band. `pdfkit`
supports this via `.rect(x, y, w, h).fillOpacity(0.1).fill(brand)`
before drawing the text.

---

## 9. TDD Test Plan

All tests under `src/**/__tests__/*.test.ts`, run via `vitest`. Order
below is the RED→GREEN rotation plan.

### 9.1 `src/lib/upload/__tests__/calculator.test.ts` (extend existing file)

New tests, each starts **red**:

1. `calculateSalary — no threshold crossed → incentive = 0, all parcels at WeightTier rate`
2. `calculateSalary — threshold exactly met (totalOrders === threshold) → incentive = 0` (because `>` not `≥`)
3. `calculateSalary — threshold crossed by 1 → parcel #2001 priced at IncentiveTier, rest unchanged`
4. `calculateSalary — 2340 parcels, mixed weights → incentive = Σ IncentiveTier commissions for 340 post-threshold parcels`
5. `calculateSalary — parcels with null deliveryDate sort last` (stable-sort invariant)
6. `calculateSalary — stable tiebreaker by waybillNumber when same deliveryDate` (reproducibility)
7. `calculateSalary — IncentiveTier missing a weight bucket → commission 0 for that parcel, no implicit fallback`
8. `calculateSalary — lineItem.isIncentive set correctly for each row`
9. `calculateSalary — snapshots: incentiveSnapshot.tiers populated with the tier array used`
10. `calculateSalary — netSalary = baseSalary + incentive + petrolSubsidy − penalty − advance` (regression guard)

### 9.2 `src/lib/staff/__tests__/month-detail.test.ts` (extend)

11. `buildTierBreakdown — zero incentive parcels → returns { base: [T1,T2,T3], incentive: [] }`
12. `buildTierBreakdown — mixed → returns { base: [...], incentive: [...] } with correct per-tier sums`
13. `buildTierBreakdown — ordering preserved T1→T2→T3 in both arrays`

### 9.3 `src/lib/staff/__tests__/incentive-snapshot.test.ts` (new)

14. `readIncentiveSnapshot — legacy shape → { tiers: null, legacyAmount: 200 }`
15. `readIncentiveSnapshot — new shape → { tiers: [...], legacyAmount: null }`
16. `readIncentiveSnapshot — malformed JSON → throws typed error`

### 9.4 `src/components/payroll/__tests__/salary-table.test.tsx` (new — component-level)

> Deviate from CLAUDE.md's "no component tests" rule only if strictly
> necessary. I propose we **skip component tests** for the badge + filter
> pill and verify manually in the browser — consistent with project
> convention. **Open question 2** — confirm.

### 9.5 `scripts/__tests__/recompute-incentive-tiers.test.ts` (new)

17. `recompute — legacy snapshot, no penalty/advance → overwrites base, incentive, net, snapshot, lineItems.isIncentive`
18. `recompute — legacy snapshot, has penalty > 0 → left untouched` (if we go with skip rule)
19. `recompute — already-new snapshot → no-op`
20. `recompute --dry-run → no writes, diff report emitted`

### 9.6 PDF perf regression

21. `month-detail-pdf — 3000-row fixture → renders in < 2s and returns non-empty Buffer` (perf smoke — skip in CI if flaky; use `test.concurrent.skipIf(process.env.CI)`)
22. `month-detail-pdf — row with isIncentive = true gets a distinct fill color applied` (snapshot-compare on a 3-row fixture PDF — enough to catch accidental style regressions without asserting exact byte output)

### Run order

Sections 9.1 → 9.2 → 9.3 → 9.5 → 9.6. Each test starts **red**, then
minimal impl, then refactor. Target ~22 new tests; current suite is 110
pass → expect 132 pass at end.

---

## 10. Files to Touch

### New

- `prisma/migrations/20260423_incentive_tiers/migration.sql`
- `src/lib/staff/incentive-snapshot.ts` — the discriminated reader
- `scripts/recompute-incentive-tiers.ts`
- `scripts/__tests__/recompute-incentive-tiers.test.ts`
- `src/lib/staff/__tests__/incentive-snapshot.test.ts`
- `docs/audit-results/incentive-recompute-YYYYMMDD.md` (generated)

### Changed

- `prisma/schema.prisma`
- `src/lib/upload/calculator.ts`
- `src/lib/upload/__tests__/calculator.test.ts`
- `src/lib/upload/pipeline.ts` — pass `incentiveTiers` into calculator;
  persist `isIncentive` on line items
- `src/lib/db/payroll.ts`, `src/lib/db/staff.ts` — select incentive
  tiers; expose `incentiveSnapshot` new shape
- `src/lib/db/defaults.ts` + `src/components/staff/defaults-drawer.tsx`
  — drop `incentiveAmount`, add 3 incentive-tier commission inputs
- `src/components/staff/dispatcher-row.tsx` + incentive-section —
  replace the single "incentive amount" field with a 3-row tier editor
  identical to weight-tier-section; threshold remains a single input
- `src/components/payroll/salary-table.tsx` — High Performer badge +
  orthogonal filter
- `src/app/(dashboard)/dispatchers/history/[salaryRecordId]/page.tsx` —
  highlight rows, show incentive summary, expanded tier breakdown
- `src/lib/staff/month-detail.ts` — `buildTierBreakdown` returns
  `{ base, incentive }`
- `src/lib/staff/month-detail-pdf.ts` — **full rewrite** with `pdfkit`
- `src/app/api/staff/[id]/history/[salaryRecordId]/export/pdf/route.ts`
  — stream response
- `src/app/api/upload/[uploadId]/rules-summary/route.ts` — use the
  discriminated snapshot reader
- `src/components/staff/history-month-row.tsx` — surface incentive tiers
  in the "Incentive" section of the drawer (read-only from snapshot;
  editable when recalculating)
- `src/app/api/staff/[id]/recalculate/route.ts` — accept incentive
  tiers in the recalc payload
- `package.json` — add `pdfkit`, `@types/pdfkit`

### Deleted

- Nothing. `@react-pdf/renderer` stays (used by payslips + summary
  tables).

---

## 11. Rollout

1. Branch `feature/incentive-tiers` from `main`.
2. Migration + calculator + tests (RED → GREEN, no deploy).
3. UI (badge, filter, highlight, drawer, defaults drawer).
4. PDF rewrite + perf test.
5. Dry-run recompute against dev Neon → inspect diff report →
   `--confirm` on dev → spot-check 5 random records in the UI.
6. `npm run build` clean, full test suite green.
7. Prod Neon rollback branch via Neon MCP.
8. `prisma migrate deploy` to prod.
9. Dry-run recompute against prod → inspect diff report → ask before
   `--confirm`.
10. Merge PR.

---

## 12. Open Questions

1. **`SalaryRecord.incentive` split vs merge** — keeping them in two
   columns (`baseSalary` + `incentive`) preserves all existing reports.
   Merging into a single `baseSalary` is what the user literally asked
   for. **My recommendation: keep split** so dashboards and CSV/PDF
   exports don't silently change meaning. Confirm?
2. **Component tests for the badge + filter** — per CLAUDE.md we don't
   test components. Recommend browser-verify only. Confirm?
3. **`pdfkit` dependency** — adding a ~500KB dep. Acceptable?
4. **Default incentive tier rates** (1.50 / 2.10 / 3.30) — these are
   50% boost over the existing default weight-tier rates (1.00 / 1.40 /
   2.20). Good starting point or pick different numbers?
5. **Recompute skip rule for penalty/advance > 0** — default: always
   recompute base+incentive+net and preserve the manual penalty+advance
   values. Alternative: skip the whole record to avoid any surprise.
   Recommend always-recompute-with-preserve, matching the "re-compute"
   user ask.
6. **Legacy snapshot readers** — there's one route
   (`rules-summary`) and one UI (history drawer) that read the old
   snapshot shape. After the recompute, only records with `penalty >
   0 || advance > 0` retain the legacy shape (if we go with Q5's
   preserve-but-recompute answer, this reduces to zero records after a
   full recompute). Still safer to ship the discriminated reader
   because an agent *could* edit penalty on a record after the
   recompute and regenerate the old shape; but consider whether the
   reader is necessary at all. Recommend: ship it for safety, it's ~30
   LOC.

---

## 13. Non-goals

- Per-dispatcher incentive-tier weight *ranges* — we mirror the
  dispatcher's existing `WeightTier` ranges. If the user wants
  different boundaries for incentive tiers, that's a follow-up.
- Retroactive "what-if" analysis UI — this is strictly a model +
  recompute, no simulator.
- Multi-threshold incentive ladders (T1 kicks in at 2000, T2 at 3000,
  etc.) — different model shape; revisit if the user wants it.
- Mobile-specific layout for the new badge/filter — desktop-first per
  project convention.
