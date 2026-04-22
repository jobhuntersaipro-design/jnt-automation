# Dispatcher Month Detail — Parcel-Level Report

## Overview

Add a per-month parcel-level detail report for any salary record belonging
to a dispatcher. Accessed from the **History drawer** on `/dispatchers`
via a new **Detail** button next to the existing **Payslip** button. The
detail opens in a new tab at a dedicated route, shows every parcel the
dispatcher delivered that month from `SalaryLineItem`, and supports CSV
and PDF download.

Reference format: `data/Abdul Hafiz.pdf` — one row per parcel, grand
totals at the bottom.

## What You Can Do After This Phase

- Click a per-month **Detail** button inside any dispatcher's history drawer.
- Open a new tab at `/dispatchers/history/[salaryRecordId]` showing
  every parcel line item for that dispatcher + month.
- See a summary: total parcels, total billing weight, and an order-count
  breakdown by the dispatcher's saved weight tiers.
- Download the full detail as **CSV** (one row per parcel, totals row at
  the bottom).
- Download the full detail as **PDF** (multi-page report matching the
  `Abdul Hafiz.pdf` layout, with company header + footer totals).

---

## Detail Button in History Drawer

### Location

In `src/components/staff/history-month-row.tsx`, the summary row currently
has:

```
[Month]  [Status pill]                    [Payslip ↓]  [▼ expand]
```

Add a **Detail** button between status and Payslip:

```
[Month]  [Status pill]     [📋 Detail]  [Payslip ↓]  [▼ expand]
```

**Behaviour:** clicking **Detail** calls `window.open(url, "_blank")` —
never navigates the drawer itself, since the drawer is modal.

**URL:** `/dispatchers/history/${record.salaryRecordId}`

**Styling:** matches the existing payslip button — outline, `text-brand`,
`hover:bg-brand/5`, icon `FileText` (Lucide).

---

## Detail Page Route

### Path

`src/app/(dashboard)/dispatchers/history/[salaryRecordId]/page.tsx`

Follows the `/dispatchers/payroll/[uploadId]` pattern. Server component —
no new client-side fetching; data is loaded by Prisma on the server.

### Data Loader

New helper in `src/lib/db/staff.ts`:

```ts
export async function getMonthDetail(
  salaryRecordId: string,
  agentId: string,
) { ... }
```

**Returns:**

```ts
{
  dispatcher: { name: string; extId: string; branchCode: string; avatarUrl: string | null }
  month: number
  year: number
  totals: {
    totalOrders: number        // count of line items
    totalWeight: number        // sum of weight
    baseSalary: number         // from SalaryRecord
    netSalary: number
  }
  weightTiers: WeightTierSnapshot[]   // from SalaryRecord.weightTiersSnapshot
  tierBreakdown: Array<{
    tier: number
    range: string              // e.g. "0–5 kg", "5.01–10 kg", "10.01+ kg"
    commission: number
    orderCount: number
    totalWeight: number
    subtotal: number           // orderCount * commission
  }>
  lineItems: Array<{
    deliveryDate: Date | null
    waybillNumber: string
    weight: number
    commission: number
  }>
}
```

**Query:**

```ts
const record = await prisma.salaryRecord.findFirst({
  where: {
    id: salaryRecordId,
    dispatcher: { branch: { agentId } },
  },
  include: {
    dispatcher: { select: { name: true, extId: true, avatarUrl: true, branch: { select: { code: true } } } },
    lineItems: { orderBy: [{ deliveryDate: "asc" }, { weight: "asc" }] },
  },
});
```

Returns `null` if not found or wrong tenant — page calls `redirect("/dispatchers")`
(no "not found" leak via 404 vs 403).

**Tier breakdown computation (pure function, unit-tested):**

```ts
// src/lib/staff/month-detail.ts
export function buildTierBreakdown(
  lineItems: { weight: number }[],
  tiers: WeightTierSnapshot[],
): TierBreakdownRow[]
```

For each tier, count line items whose weight falls in `[minWeight, maxWeight]`
(null maxWeight = open upper bound). Compute orderCount, totalWeight, subtotal.

### Page Layout

Desktop:

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back to Dispatchers                                          │
│                                                                 │
│  [avatar] Abdul Hafiz bin Yusof                                 │
│          PHG379-42 · Kepong · February 2026                     │
│                                                                 │
│  ┌─────────┬──────────┬──────────┬──────────┐                  │
│  │ Orders  │ Weight   │ Base     │ Net      │                  │
│  │ 4,780   │ 4,781.2  │ RM 4,850 │ RM 5,200 │                  │
│  └─────────┴──────────┴──────────┴──────────┘                  │
│                                                                 │
│  [Download CSV] [Download PDF]                                  │
│                                                                 │
│  ── Weight Tier Breakdown ──                                    │
│  ┌────────────┬──────────┬────────┬──────────┐                 │
│  │ Range      │ Rate     │ Orders │ Subtotal │                 │
│  │ 0–5 kg     │ RM 1.00  │ 4,777  │ RM 4,777 │                 │
│  │ 5.01–10 kg │ RM 1.40  │   3    │ RM 4.20  │                 │
│  │ 10.01+ kg  │ RM 2.20  │   0    │ RM 0     │                 │
│  └────────────┴──────────┴────────┴──────────┘                 │
│                                                                 │
│  ── Parcel Line Items (4,780) ──                                │
│  ┌────────────┬──────────────────┬─────────────────┬─────────┐ │
│  │ Date       │ AWB No.          │ Dispatcher      │ Weight  │ │
│  │ 2026-02-01 │ 648019689901     │ ABDUL HAFIZ BIN │  0.04   │ │
│  │ 2026-02-01 │ 631967152110     │ ABDUL HAFIZ BIN │  0.06   │ │
│  │ ...        │ ...              │ ...             │  ...    │ │
│  │ 2026-02-28 │ 680079665449106  │ ABDUL HAFIZ BIN │  8.50   │ │
│  └────────────┴──────────────────┴─────────────────┴─────────┘ │
│  Showing 4,780 of 4,780 parcels · Total weight: 4,781.20 kg    │
└─────────────────────────────────────────────────────────────────┘
```

**Mobile:** stack summary tier table + parcel table, horizontal scroll
on parcel table (same pattern as existing tables).

### Table Details

**Parcel line items table:**
- Sort: by `deliveryDate ASC`, tiebreak `weight ASC`.
- Columns: `Date | AWB No. | Dispatcher Name | Weight`.
  - Weight column shows `weight.toFixed(2)` kg; right-aligned; `tabular-nums`.
  - Dispatcher name is the full name (same for every row — kept for CSV/PDF
    parity with the reference export).
  - Date format: `YYYY-MM-DD`; shows `—` if null.
- Virtualised if >1000 rows to keep scroll smooth — use `@tanstack/react-virtual`
  which is not yet installed. If unwilling to add the dep, paginate at 500/page.
- Client-side search: filter box matches AWB prefix.

**Tier breakdown table:**
- Rendered from the server-side computed `tierBreakdown`.
- Always 3 rows (matches the 3-tier model), even if some have 0 orders.

---

## CSV Export

### Route

`GET /api/staff/[id]/history/[salaryRecordId]/export/csv`

Returns `text/csv` with `Content-Disposition: attachment; filename="..."`.

### Format

```
Dispatcher,ABDUL HAFIZ BIN YUSOF
Dispatcher ID,PHG379-42
Branch,PHG379
Month,February 2026

Business Date,AWB No.,Dispatcher Name,Billing Weight (kg)
2026-02-01,648019689901,ABDUL HAFIZ BIN YUSOF,0.04
2026-02-01,631967152110,ABDUL HAFIZ BIN YUSOF,0.06
...
2026-02-28,680079665449106,ABDUL HAFIZ BIN YUSOF,8.50
TOTAL,,,4781.20

Tier Breakdown
Tier,Range,Rate (RM),Orders,Subtotal (RM)
1,0–5 kg,1.00,4777,4777.00
2,5.01–10 kg,1.40,3,4.20
3,10.01+ kg,2.20,0,0.00
```

**Filename:** `history_{extId}_{year}-{month:02}.csv`

### Implementation

Follow the existing per-dispatcher CSV pattern at
`src/app/api/staff/[id]/export/csv/route.ts` (use the same
`escapeCsv` helper — extract it to `src/lib/csv.ts` on first dup).

---

## PDF Export

### Route

`GET /api/staff/[id]/history/[salaryRecordId]/export/pdf`

Returns `application/pdf` inline by default; `?download=1` adds
`Content-Disposition: attachment; filename="..."`.

### Layout

Matches `Abdul Hafiz.pdf`:

- **Page header (first page only)**:
  - Dispatcher name + ID + branch + month/year
  - Summary line: total orders, total weight, base salary, net salary
- **Running header on every page:** `{Dispatcher Name} — {Month} {Year}` + page number
- **Body table:** columns `#, Business Date, AWB No., Dispatcher Name, Billing Weight`
  - Row# is 1-indexed, continues across pages
  - `Billing Weight` column appears right-aligned
  - "Count" column (always `1` per row, matching the reference) is included
    to preserve the sum at the bottom
- **Final page footer:** `TOTAL    {sum of weight}` right-aligned in the Weight column

### Implementation

Reuse `@react-pdf/renderer` (already a dep — see `src/lib/payroll/pdf-generator.ts`).
New file `src/lib/staff/month-detail-pdf.ts` exports:

```ts
export async function generateMonthDetailPdf(detail: MonthDetail): Promise<Buffer>
```

Page size `A4`, 12pt monospaced table body (`Courier`) to mirror the reference.

**Row density:** ~40-45 line items per page → a 4,780-row month = ~115 pages.
For month detail PDFs with > 2,000 line items, emit a `page-break` every 45
rows. Stream-generate — no in-memory buffering of the full PDF is required.

**Filename:** `history_{extId}_{year}-{month:02}.pdf`

---

## TDD Approach

### Pure logic (test-first)

New file `src/lib/staff/__tests__/month-detail.test.ts` covering
`buildTierBreakdown`:

| Test | Description |
|---|---|
| `happy-path` | 3-tier default, rows across all tiers → correct counts and subtotals |
| `edge-boundary` | Item at exactly `5.00` kg → tier 1, not tier 2; at `5.01` → tier 2 |
| `open-upper-bound` | Tier 3 with `maxWeight: null` captures `10.01`, `50`, `∞` |
| `empty-line-items` | Returns 3 rows all with `0` orders and `0` subtotal |
| `tier-missing` | If snapshot has only 2 tiers (malformed), function still returns the rows it has without throwing |

Write these tests **before** the implementation — they drive the signature.

### CSV generation

`escapeCsv` is already battle-tested in `staff/[id]/export/csv/route.ts`.
No new unit tests needed; one smoke test on the month detail CSV endpoint
if time permits (stretch).

### PDF

Skip unit tests for PDF — manual verification against `Abdul Hafiz.pdf` is
the acceptance gate.

### Integration

Manual acceptance — run the app, open a dispatcher with known salary records,
click **Detail**, verify the numbers match the existing payslip PDF totals.

---

## API Routes Summary

| Route | Method | Response |
|---|---|---|
| `/dispatchers/history/[salaryRecordId]` | GET (page) | SSR HTML page |
| `/api/staff/[id]/history/[salaryRecordId]/export/csv` | GET | `text/csv` |
| `/api/staff/[id]/history/[salaryRecordId]/export/pdf` | GET | `application/pdf` |

All three enforce `agentId` ownership via `getEffectiveAgentId()`. Both
export endpoints accept `[id]` = `dispatcherId` as a redundant safety
check; if it doesn't match the salary record's dispatcher, return 404.

---

## Files Changed / Added

### Added
- `src/app/(dashboard)/dispatchers/history/[salaryRecordId]/page.tsx` — detail page (server component)
- `src/app/(dashboard)/dispatchers/history/[salaryRecordId]/loading.tsx` — skeleton
- `src/app/api/staff/[id]/history/[salaryRecordId]/export/csv/route.ts`
- `src/app/api/staff/[id]/history/[salaryRecordId]/export/pdf/route.ts`
- `src/lib/staff/month-detail.ts` — `buildTierBreakdown` + types
- `src/lib/staff/month-detail-pdf.ts` — PDF generator
- `src/lib/staff/__tests__/month-detail.test.ts` — tier-breakdown unit tests
- `src/components/staff/month-detail-client.tsx` — client-side search/pagination for the parcel table
- `src/lib/csv.ts` — extracted `escapeCsv` helper (dedup)

### Modified
- `src/lib/db/staff.ts` — `getMonthDetail(salaryRecordId, agentId)`
- `src/components/staff/history-month-row.tsx` — add **Detail** button in summary row
- `src/app/api/staff/[id]/export/csv/route.ts` — use extracted `escapeCsv`
- `src/app/api/payroll/upload/[uploadId]/export/csv/route.ts` — use extracted `escapeCsv` (if present)

---

## Out of Scope

- No edit on the detail page — parcel data is historical and must not change.
- No search/filter on date range — the page is scoped to a single month.
- No edit of parcel commissions — tier commissions are already locked via
  `weightTiersSnapshot`; subtotal is read-only.
- No export of tier breakdown alone — CSV/PDF always include both parcel
  list and tier breakdown.
- No "email PDF" or "send to dispatcher" actions — downloads only.

---

## Acceptance Criteria

- [ ] Detail button appears on every saved month in the history drawer.
- [ ] Clicking Detail opens `/dispatchers/history/[salaryRecordId]` in a new tab.
- [ ] Visiting another agent's salary record URL redirects to `/dispatchers`.
- [ ] The page's tier breakdown totals equal the `baseSalary` value shown in the summary card.
- [ ] CSV downloads with the exact column order: `Business Date, AWB No., Dispatcher Name, Billing Weight`.
- [ ] CSV TOTAL row equals the summary `totalWeight` value.
- [ ] PDF total-weight footer matches the CSV TOTAL row.
- [ ] PDF layout (monospace font, grand total row, page numbers) matches `Abdul Hafiz.pdf` within a reasonable tolerance.
- [ ] `buildTierBreakdown` unit tests pass (written before implementation).
- [ ] Build is clean, existing 43 tests still pass.

---

## Open Questions

1. **Virtualisation vs pagination** for the 4,780-row parcel table. Default:
   paginate at 500/page to avoid adding `@tanstack/react-virtual`. Revisit
   if paging feels sluggish.
2. **"Dispatcher Name" column** — in the reference PDF every row has the
   same dispatcher name (this is a single-dispatcher report). Keep it for
   CSV/PDF parity, but the on-screen table can collapse the repeating value
   into the page header instead. Default: keep in CSV/PDF, drop from on-screen.
3. **Tier breakdown ranges display** — use `0–5 kg / 5.01–10 kg / 10.01+ kg`
   or the raw snapshot values if the dispatcher has non-default tiers?
   Default: render from snapshot so customised tiers are correct.
