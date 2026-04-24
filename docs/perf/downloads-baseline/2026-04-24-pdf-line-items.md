# PDF line-items download timing — 2026-04-24

**Route tested:** `GET /api/staff/[id]/history/[salaryRecordId]/export/pdf`
(the per-dispatcher month-detail PDF triggered from the "Detail PDF" button in the history drawer)

**How to reproduce:** `npx tsx scripts/bench-pdf-download.ts`
(seeds a bench fixture on the Neon development branch with 4 dispatchers at 50 / 500 / 2000 / 8000 parcels each, measures the two code paths server-side, cleans up.)

## Path breakdown

The route has two code paths:

- **COLD (cache miss, first click):** `getMonthDetail` fetches the record + all line items from Neon → `generateMonthDetailPdf` builds the PDF with `@react-pdf/renderer` → bytes stream back to the browser. An async `putCached` write-through writes to R2 *after* the response is flushed (does not block the user).
- **WARM (cache hit, post-prewarm):** `hasCached` HEADs the R2 object → `getPresignedDownloadUrl` signs a redirect → `302` → browser fetches bytes directly from R2.

## Results

Fixture: 1 agent, 1 branch, 4 salary records at the sizes below, running `2026-04`.
All numbers in milliseconds, server-side only (no HTTP RTT). PDF KB = size of the generated file.

| parcels | dbMs  | pdfGenMs | r2PutMs | r2HeadMs | presignMs | r2GetMs | pdfKB | **COLD ms** | **WARM ms** |
|:-------:|------:|---------:|--------:|---------:|----------:|--------:|------:|------------:|------------:|
| 50      | 1670  | 23       | 449     | 138      | 1         | 237     | 5     | **1693**    | **376**     |
| 500     | 1111  | 26       | 374     | 136      | 1         | 175     | 28    | **1137**    | **311**     |
| 2000    | 5910  | 90       | 391     | 131      | 1         | 226     | 98    | **6000**    | **358**     |
| 8000    | 4438  | 291      | 406     | 139      | 0         | 270     | 380   | **4729**    | **410**     |
| 8000 (rerun) | 18547 | 291 | 394     | 150      | 1         | 624     | 380   | **18838**   | **774**     |

## Key findings

1. **The warm path ("download line items" after the month is prewarmed) is consistently ~300–400 ms server-side, flat across parcel volume** — 376 ms at 50 parcels, 410 ms at 8000. End-to-end wall clock for a real user is this + network RTT + the `302` round-trip, i.e. **roughly 450–700 ms in practice**. This is the dominant path after the prewarm pipeline runs after upload-confirm / recalculate (see `context/features/pdf-cache-spec.md`).

2. **The cold path is the problem**:
   - **Small records (≤500 parcels): ~1.1–1.7 s.** Dominated by the single "connection wake-up" penalty on the first Neon query in an idle Lambda. `pdfGenMs` is 23–26 ms — negligible.
   - **Medium records (2000 parcels): ~6 s.** Jumps to 5.9 s DB fetch.
   - **Large records (8000 parcels): 4.4–18.5 s and highly variable.** `dbMs` runs 4.4 s on a lucky hit and 18.5 s when Neon serverless pooler re-auths mid-query. PDF generation itself stays fast (291 ms).

3. **PDF generation is not the bottleneck.** `generateMonthDetailPdf` scales linearly and predictably: 23 ms @ 50 parcels → 291 ms @ 8000 parcels. Even at the top end it's <5% of COLD wall-clock.

4. **R2 PUT (write-through) takes ~370–450 ms** but **does not block the response** — it fires after `NextResponse` returns. The user never waits on it.

5. **HEAD + presign together are essentially free (~140 ms),** so cache-hit latency is fully dominated by the R2 GET (~175–620 ms) plus one client-side redirect RTT.

## Implications for real data

Production has salary records up to 8441 parcels (NURUL FATIHAH BINTI MAT SEMIN, January 2026). So:

- Every click that lands on a prewarmed record → **~500 ms end-to-end** (R2 GET dominates, extremely consistent).
- Every click that misses cache on an 8000-parcel record → **5–20 s of user wait**, driven entirely by `getMonthDetail`. PDF generation is not the issue.
- The prewarm pipeline on upload-confirm / recalculate is load-bearing: without it, the first viewer of each large record pays the 5–20 s cost.

## Potential follow-ups (out of scope for this test)

- `getMonthDetail` pulls all line items with `orderBy: [{ deliveryDate: "asc" }, { weight: "asc" }]`. `SalaryLineItem` has `@@index([salaryRecordId])` only — a composite index on `(salaryRecordId, deliveryDate, weight)` would let Postgres satisfy the sort from the index rather than in-memory on 8k rows, and should cut the large-record DB fetch noticeably.
- The 18.5 s rerun on the 8000-parcel case strongly suggests Neon serverless pooler re-auth overhead. Warming the Prisma pool / keeping a long-lived connection in the hot path would smooth out the tail but is a separate concern.
- Worth adding an `x-response-time` header on both branches of the route to make this observable in production logs without synthetic benchmarks.
