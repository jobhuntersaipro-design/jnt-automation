# Download Performance Optimization — Spec

> **Status:** APPROVED — ready for implementation. Q1 = (b) QStash fan-out. Q2 = 30-day safety TTL. Q3 = priority confirmed. Q4 = scripted benchmark.

## Problem

CSV/PDF downloads — especially line-item exports — are slow enough that users notice. The current architecture has five concrete bottlenecks, plus a UX gap (progress is coarse and jobs "expire" in 2 h).

## Current architecture (what we have today)

### Download paths in scope

| # | Route | Mode | Bottleneck |
|---|-------|------|-----------|
| 1 | `POST /api/payroll/upload/[uploadId]/payslips` | Inline, serial loop | Up to 50 PDFs generated **one at a time** in a single request. Full ZIP buffered in memory before the HTTP response. ([route.ts:100-135](src/app/api/payroll/upload/[uploadId]/payslips/route.ts#L100-L135)) |
| 2 | `POST /api/employee-payroll/[m]/[y]/payslips` | Inline, serial loop | Same pattern as #1. |
| 3 | `POST /api/dispatchers/month-detail/bulk/start` → worker | Async job, single-session worker | JSZip buffers the whole ZIP in RAM; `PutObject` then `GetObject` round-trips a large buffer through R2. Concurrency 4 (PDF) / 8 (CSV). ([bulk-export-worker.ts:81-164](src/lib/staff/bulk-export-worker.ts#L81-L164)) |
| 4 | `GET /api/dispatchers/month-detail/bulk/[jobId]/download` | Inline | Calls `transformToByteArray()` → buffers the whole ZIP before streaming. ([download/route.ts:38](src/app/api/dispatchers/month-detail/bulk/[jobId]/download/route.ts#L38)) |
| 5 | `GET /api/staff/[id]/history/[recordId]/export/{csv,pdf}` | Inline | Single-dispatcher month detail; buffers full parcel list. Generally fast but scales poorly past ~1 k line items. |

### The 2-hour TTL

All in [bulk-job.ts](src/lib/staff/bulk-job.ts):
- **L61:** `const TTL_SECONDS = 7200;`
- **L83, L85, L105, L114:** applied to job record, active set, recent list.

R2 objects have **no** expiry — they persist forever. So "export expired" today means "the Redis pointer is gone, the ZIP still exists but we can't find it." That's a bug, not a feature.

### Progress today

- Polling `GET /bulk/active` every 1.5 s (active) / 3 s (idle).
- Stages: `queued → fetching → generating → zipping → uploading → done`.
- Ring percentage = `done / total` dispatchers, throttled to every **2 files** ([bulk-export-worker.ts:128](src/lib/staff/bulk-export-worker.ts#L128)).
- No per-stage weighting: the bar pauses at 100% for the zipping + uploading stages (which can take a meaningful chunk of the total time on big jobs).
- No per-dispatcher label ("Generating Ahmad B…") — just "Generating 15 / 47".

---

## Goals

1. **Cut wall-clock time** for the two worst offenders (inline payslips bulk, bulk month-detail) by ≥ 50 % on a 50-dispatcher / 10 k-line-item fixture.
2. **Extend job expiry to 30 days** — jobs and their R2 ZIPs stay accessible for a month instead of 2 hours.
3. **Show real progress** — granular per-file labels, weighted across stages, first byte of download visible within seconds even on large jobs.
4. **Ship incrementally** — every phase has measurable deltas and can ship independently.

## Non-goals

- Migrating to a proper external queue (SQS, Temporal, etc.). QStash is already wired up for upload processing; if we need true fan-out in prod we reuse that pattern.
- Changing the bulk-export UI surface beyond copy + progress-bar behavior (no new pages, no deep restructure of the Downloads Center).
- Touching the overview / dispatcher-history exports (#5 above) — they're fast enough today; revisit only if measurements say otherwise.

---

## Phased plan

### Phase 0 — Measure

**Deliverable:** `docs/perf/downloads-baseline/` with numbers for today's architecture.

- Script `scripts/bench-downloads.ts` that seeds a configurable fixture (50 dispatchers × 200 parcels/each by default), fires each of the 5 download paths end-to-end against the dev server, records:
  - Wall-clock time to first byte (TTFB)
  - Wall-clock time to last byte
  - Peak process RSS during the request
  - ZIP size
- Playwright test `e2e/downloads.spec.ts` is **not** the primary measurement — it's kept as a smoke check that each path returns a usable file. A scripted benchmark is cheaper and more reproducible. (See Q4.)
- Target matrix we commit to beating in later phases:
  ```
  | Path                          | TTFB | Total | RSS |
  | inline payslips ZIP (50)      |  …s  |  …s   |  …MB |
  | bulk month-detail CSV (50)    |  …s  |  …s   |  …MB |
  | bulk month-detail PDF (50)    |  …s  |  …s   |  …MB |
  | single dispatcher PDF         |  …s  |  …s   |  …MB |
  ```

### Phase 1 — Inline payslips: parallelize

**Target:** #1 and #2 above. Simplest, biggest win.

**Changes:**
- Replace the serial `for (const record of salaryRecords)` loop in [payslips/route.ts:100-135](src/app/api/payroll/upload/[uploadId]/payslips/route.ts#L100-L135) with the existing bounded pool pattern from `runPool` (currently embedded in [bulk-export-worker.ts:20-38](src/lib/staff/bulk-export-worker.ts#L20-L38)).
- Extract `runPool` into a shared util: `src/lib/upload/run-pool.ts` (already exists per CLAUDE.md — verify and reuse).
- Concurrency **4** for PDF (same bounds as the bulk worker, known safe ceiling).
- Same change for `POST /api/employee-payroll/[m]/[y]/payslips`.

**Expected delta:** ~4× on the PDF-generation leg for 50 payslips. Real measured win depends on how much of the 10 s CLAUDE.md mentioned is PDF vs DB+ZIP.

**No behavior change** — still inline, still returns ZIP in the HTTP response. Just faster.

### Phase 2 — Extend expiry to 30 days

**Changes:**
- Bump `TTL_SECONDS` in [bulk-job.ts:61](src/lib/staff/bulk-job.ts#L61) from `7200` (2 h) to `2592000` (30 d). Keep every existing `{ ex: TTL_SECONDS }` and `redis.expire(...)` call untouched — same semantics, longer window.
- Bump `RECENT_CAP` from 20 → 50 so the Downloads Center keeps a richer history now that entries persist a month.
- Add an R2 lifecycle rule on the `bulk-exports/` prefix that deletes objects older than 30 days. Keeps Redis metadata and R2 blob aligned — no more "pointer expired but blob lingers" situation.
- Keep the lazy-sweep logic for orphan active-set IDs — cheap protection.

**Risk:** Redis key count grows by 30× vs today. At ~1 export/day/agent, that's ~30 keys/agent at steady state — negligible.

### Phase 3 — Bulk worker: stream + chunk

**Target:** #3 and #4. Two subphases, both can land in the same PR but are independently testable.

#### 3a — Streaming ZIP → R2

- Replace **JSZip in-memory** with [`archiver`](https://github.com/archiverjs/node-archiver) (streaming) piped into [`@aws-sdk/lib-storage`](https://www.npmjs.com/package/@aws-sdk/lib-storage) `Upload` — already a transitive dep via `@aws-sdk/*`. Streaming upload means we start pushing to R2 before the ZIP is fully built; RAM usage stays flat instead of growing with the ZIP size.
- Replace `transformToByteArray()` in [download/route.ts:38](src/app/api/dispatchers/month-detail/bulk/[jobId]/download/route.ts#L38) with `obj.Body` as a web `ReadableStream` directly — `new NextResponse(obj.Body.transformToWebStream(), …)`. TTFB drops to ~network RTT; RAM flat.

#### 3b — QStash fan-out: parallel workers on one job

**Goal:** one job, one final ZIP, but the dispatcher list is split across N parallel QStash workers so wall-clock scales with worker count instead of file count.

**Topology:**

```
POST /bulk/start
  → creates BulkJob { status:queued, totalChunks:N, chunks:[] }
  → publishes N QStash messages, one per chunk (dispatcherIds subset)

POST /bulk/worker/chunk   (QStash-signed, idempotent)
  ↳ worker k: fetches its dispatcher slice, generates files,
    uploads a part ZIP to bulk-exports/{agentId}/{jobId}/parts/{k}.zip,
    updates job.chunks[k] = { status:done, r2Key, fileCount }
  ↳ if it's the last chunk to finish (atomic Redis check), publishes
    POST /bulk/worker/finalize

POST /bulk/worker/finalize   (QStash-signed, idempotent)
  ↳ streams every part ZIP from R2, expands entries, re-archives into
    the final bulk-exports/{agentId}/{jobId}/{year}_{mm}_details.zip
    via archiver + @aws-sdk/lib-storage (Phase 3a primitives).
  ↳ deletes the part ZIPs.
  ↳ flips job to { status:done, r2Key:<final> }.
```

**Chunk sizing:** `chunkSize = 15` dispatchers (configurable). 60-dispatcher job → 4 workers. Tuned so each worker finishes well under the QStash 15-min invocation cap with PDF concurrency 4 on its own slice.

**Data structures** ([bulk-job.ts](src/lib/staff/bulk-job.ts)):
- Add `BulkJob.totalChunks: number`, `BulkJob.completedChunks: number`.
- Add `BulkJob.chunks: Array<{ index, dispatcherIds, status, r2Key?, fileCount?, error? }>`.
- Replace per-file progress writes with per-chunk progress — the panel still renders `done / total` files by summing `chunks[*].fileCount` during generation.

**Why a finalize step instead of letting workers append to one ZIP:** archiver doesn't support concurrent writes, and ZIP is not a concatenable format. Part-ZIPs → final archive is the cleanest pattern and adds ~one R2 round-trip per part, which is fast compared to PDF generation.

**Idempotency:** both `/chunk` and `/finalize` handlers check `job.chunks[k].status === "done"` / `job.status === "done"` and no-op if already processed — QStash retries are safe.

**Dev mode:** no QStash available on localhost. `dispatchBulkExport` in dev keeps the current inline pool pattern (single-session, higher concurrency since the 15-min cap doesn't apply). Same code path as today's dev fallback in [bulk-export-worker.ts:213-227](src/lib/staff/bulk-export-worker.ts#L213-L227) — just reused, not changed.

**Prod concurrency budget:** 4 workers × 4 PDF each = 16 concurrent PDFs. Memory stays bounded because each worker is its own QStash invocation in its own process.

**Expected delta on a 60-dispatcher PDF export:** ~4× wall-clock improvement (4 workers) on top of Phase 3a's streaming win.

### Phase 4 — Granular progress

**UI / API surface on [bulk-job.ts](src/lib/staff/bulk-job.ts):**
- Add `BulkJob.currentLabel?: string` — the dispatcher being processed right now (`"Ahmad Bin Hamid"`).
- Add `BulkJob.stageWeights` table (constant in code, not persisted): fetching 5 %, generating 70 %, zipping 15 %, uploading 10 %.
- Worker writes `currentLabel` on entry to each dispatcher in the pool. Write frequency jumps from every 2 files → **every file** during generation (cheap — Upstash handles this fine at ~1 write/s for a 60-person job).

**[downloads-panel.tsx](src/components/dashboard/downloads-panel.tsx):**
- Replace `Generating 15 / 47` with `Generating Ahmad Bin Hamid  ·  15 / 47`.
- Use weighted `percent` so the bar doesn't stall at 100 % while zipping + uploading run.

**[bulk-jobs-indicator.tsx](src/components/dashboard/bulk-jobs-indicator.tsx):**
- Ring fraction uses the same weighted formula (consistent with panel).

---

## Tests

- **Unit** (`vitest`):
  - `run-pool.test.ts` — already exists if lifted from `src/lib/upload/run-pool.ts`; extend with a bounded-ordering assertion.
  - `bulk-job.test.ts` — new; TTL-removal regression (job record still exists at t + 3 h).
  - `stage-weights.test.ts` — new; percent calculation at each stage boundary.
- **Integration** — scripted `scripts/bench-downloads.ts` (Phase 0) doubles as a perf regression guard: fails the next run if any TTFB jumps by > 25 % vs the committed baseline.
- **E2E** (`playwright`) — one smoke test per download path (`e2e/downloads.spec.ts`) asserting the returned content-type and a non-trivial body size. Existing test account has no data; the script seeds a minimal fixture before the E2E runs, torn down after.

## Rollout order & risk

| Phase | Risk | Ships independently? |
|-------|------|----------------------|
| 0 — measure | none | yes |
| 1 — parallel inline payslips | **low** — same inputs/outputs | yes |
| 2 — 30-day TTL + R2 lifecycle | low (data growth only) | yes |
| 3a — streaming ZIP/R2 | medium — replaces JSZip; needs real-data soak | yes |
| 3b — QStash fan-out | **high** — new signed routes, chunk state, finalize step; needs prod smoke with real QStash | **after 3a** |
| 4 — granular progress | low — additive fields | yes |

Phases 1, 2, 4 can run in parallel. Phase 3 is sequential (3a → 3b).

---

## Resolved decisions

- **Q1 — chunking:** (b) QStash fan-out → Phase 3b writeup above.
- **Q2 — expiry:** 30-day safety TTL on Redis + matching R2 lifecycle rule → Phase 2 writeup above.
- **Q3 — priority:** bulk month-detail → inline payslips → single-dispatcher. Phases 1 / 3 ordering matches.
- **Q4 — baseline:** scripted `scripts/bench-downloads.ts` benchmark; Playwright smoke-only.
