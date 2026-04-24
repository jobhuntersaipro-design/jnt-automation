# PDF Line-Items Download — Audit & Optimization Report

**Date:** 2026-04-24
**Baseline:** 220/220 vitest passing · main @ `27a575c`
**Scope:** All three code paths that generate per-parcel PDFs/CSVs from `SalaryLineItem` rows.

---

## 1. What was audited

Three user-facing entry points share a common generator:

| Entry point | Route | Path |
|---|---|---|
| Single dispatcher-month PDF | `GET /api/staff/[id]/history/[salaryRecordId]/export/pdf` | generates one PDF synchronously in the request |
| Single dispatcher-month CSV | `GET /api/staff/[id]/history/[salaryRecordId]/export/csv` | generates CSV synchronously |
| Bulk per-month ZIP | `POST /api/dispatchers/month-detail/bulk/start` → QStash fan-out or inline worker → streamed ZIP uploaded to R2 | |

Shared generator: [`generateMonthDetailFiles()`](src/lib/staff/month-detail-files.ts#L42) → [`generateMonthDetailPdf()`](src/lib/staff/month-detail-pdf.ts) / [`generateMonthDetailCsv()`](src/lib/staff/month-detail-csv.ts).

Fan-out orchestration: [`dispatchBulkExport()`](src/lib/staff/bulk-export-worker.ts#L180) → [`startBulkExportFanout()`](src/lib/staff/bulk-export-worker.ts#L123) → [`runBulkExportChunk()`](src/lib/staff/bulk-export-worker.ts#L201) → [`finalizeBulkExport()`](src/lib/staff/bulk-finalize.ts#L22).

---

## 2. Confirmed bugs (fix before shipping cache layer)

### B1. Non-atomic `done` counter in QStash chunk worker

[`src/lib/staff/bulk-export-worker.ts:227-235`](src/lib/staff/bulk-export-worker.ts#L227-L235)

```ts
onFile: async ({ dispatcherName }) => {
  const latest = await getJob(jobId);
  if (!latest) return;
  await updateJob(jobId, {
    done: (latest.done ?? 0) + 1,
    currentLabel: dispatcherName,
  });
},
```

Read–modify–write with no atomicity guard. Under fan-out N chunks × 15 files each run **in parallel** across separate Lambdas → concurrent writers routinely lose increments. The total at finalize is then re-synced from chunk results, so the final number is correct, but the **progress bar jumps backwards / stalls** mid-run, and the "Generating Ahmad · 15 / 47" label can flicker.

**Fix:** Replace with atomic Redis INCR on a dedicated counter key (same pattern as [`incrementChunksDone()`](src/lib/staff/bulk-job.ts#L82)). Read the counter when composing the job response rather than writing it back.

### B2. `finalizeBulkExport` runs `getMonthDetailsBatch` only for the notification string

[`src/lib/staff/bulk-finalize.ts:103-113`](src/lib/staff/bulk-finalize.ts#L103-L113)

After the merged ZIP is uploaded, the finalize worker issues a full `getMonthDetailsBatch(agentId, year, month)` query (joins `salaryRecord` + `dispatcher` + **every `SalaryLineItem`**) just to compute `topBranch` for the notification `detail` field.

At 50 dispatchers × ~2000 parcels = 100k rows pulled from Postgres over the network for a cosmetic string. Adds seconds of latency + memory pressure inside an already-hot 600s Lambda.

**Fix:** Add `listBranchCountsForMonth(agentId, year, month)` with `groupBy({ _count })` on the `dispatcher → branch` join. Or store `branchCode` on each `ChunkState` during chunk runs and aggregate in-memory at finalize.

### B3. Partial-success is silently reported as `status: "done"`

[`src/lib/staff/bulk-finalize.ts:41-51`](src/lib/staff/bulk-finalize.ts#L41-L51)

```ts
if (partKeys.length === 0) {
  await updateJob(jobId, { status: "failed", error: "All chunks failed …" });
  return;
}
```

The guard only fails the job when **every** chunk failed. If half of 6 chunks fail (3 of them at different dispatchers), the final ZIP contains only the successful chunks' files, the job is marked `status: "done"`, the toast says "Bulk PDF export ready · 47 dispatchers", and the user never learns **3 chunks × 15 dispatchers = 45 dispatchers' files are missing**.

**Fix:** If `partKeys.length < totalChunks`, set `status: "done"` but add a `warning` field + badge ("Generated 45 of 90 · 45 failed — retry") in the Downloads Panel. Create a second notification of type `"warning"`.

### B4. `patchChunk` loses writes under concurrent finish

[`src/lib/staff/bulk-job.ts`](src/lib/staff/bulk-job.ts) (`patchChunk` function)

`patchChunk(jobId, chunkIndex, ...)` does `getJob() → mutate chunks array → setJSON()`. Two chunks finishing within the same ~5 ms window both read the same stale array, one mutates index 3, the other mutates index 7, last writer wins → **one chunk's status/r2Key is dropped**.

Finalize then sees one chunk stuck at `status: "running"` with no `r2Key`, filters it out, and archives without that chunk's files (flows into B3).

**Fix:** Store each chunk's state on its own key (`bulk-job:{jobId}:chunk:{index}`) so writes are independent. Reconstruct the array in `getJob()` via MGET. Alternatively keep the array and use Lua script for atomic slice-update.

### B5. Filename header not RFC 5987 encoded

[`src/app/api/staff/[id]/history/[salaryRecordId]/export/pdf/route.ts:77`](src/app/api/staff/[id]/history/[salaryRecordId]/export/pdf/route.ts#L77)

```ts
"Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
```

`monthDetailFilename()` sanitizes to ASCII so this is safe today, but it will break the moment the sanitizer is relaxed (e.g. to keep Unicode names). Two call sites — also the CSV route.

**Fix:** Use `filename*=UTF-8''${encodeURIComponent(filename)}` alongside the ASCII fallback.

### B6. No rate-limit on `/bulk/start`

[`src/app/api/dispatchers/month-detail/bulk/start/route.ts`](src/app/api/dispatchers/month-detail/bulk/start/route.ts)

A logged-in client can POST `/start` in a loop. Each call:
- Creates a Redis job record
- Lists all dispatchers
- Publishes N QStash messages (N = dispatchers ÷ 15)
- Each message triggers a Lambda that hits Postgres + R2

At 50 dispatchers that's ~4 QStash messages × 200 loops/min = serious bill exposure. The existing [`src/lib/rate-limit.ts`](src/lib/rate-limit.ts) helpers (used on auth routes) can be reused — suggest 5 starts per agent per 5 minutes.

### B7. Inline fallback in prod is lost on Lambda exit

[`src/lib/staff/bulk-export-worker.ts:164-170`](src/lib/staff/bulk-export-worker.ts#L164-L170)

```ts
} catch (err) {
  // Fall back to inline so the export still completes.
  runBulkExport(jobId).catch(...);
}
```

If QStash publish fails during `startBulkExportFanout()`, the code schedules `runBulkExport(jobId)` as a fire-and-forget Promise on the **same request Lambda** that is about to return. Vercel kills the Lambda once the response is flushed → the inline fallback dies mid-flight.

**Fix:** On QStash publish failure, set `status: "failed"` with a retry button in the Downloads Panel rather than attempting inline recovery from a request handler. The user clicks retry, which re-publishes.

### B8. `pdfkit` assembles full document in memory for every request

[`src/lib/staff/month-detail-pdf.ts`](src/lib/staff/month-detail-pdf.ts) returns `Promise<Buffer>`. The single-PDF route then wraps it in `new Uint8Array(pdf)` and the Response holds both copies until GC. At ~500 KB per PDF and Vercel's 1024 MB Lambda memory, 100 concurrent requests ≈ 100 MB of buffered PDFs — fine today, but the wrapping double-allocation is free to remove.

**Fix:** Switch the generator to a `Readable` stream, pipe directly into the Response body via `Readable.toWeb()`. Same pattern used in the ZIP download route.

### B9. No idempotency key on duplicate clicks

Two rapid clicks on "Bulk Detail" both POST `/start`, create two jobs, run two parallel fan-outs. The UI debounces via React state, but a stale-tab scenario bypasses that. Add an `Idempotency-Key` derived from `{agentId}:{year}:{month}:{format}:{minute}` — if a running job exists for the same key, return its `jobId` instead of creating a new one. **This is a natural fit with the cache layer below** — a canonical cache key replaces the need entirely.

---

## 3. Performance observations (not bugs but ship-blockers for UX)

| # | Location | Observation |
|---|---|---|
| P1 | [`month-detail-pdf.ts`](src/lib/staff/month-detail-pdf.ts) | Single-PDF generation measured ~3–15 s for 2–3k parcels on Vercel cold path. Every click regenerates. This is the #1 user-visible latency. |
| P2 | [`runBulkExportChunk`](src/lib/staff/bulk-export-worker.ts#L201) | QStash chunks run in parallel but each chunk's 15 dispatchers run at concurrency 4 → worst case ~2 min per chunk. |
| P3 | [`extractEntriesFromR2`](src/lib/staff/bulk-finalize.ts#L147) | Buffers each part ZIP fully before piping to archiver. 15 × 500 KB = 7.5 MB today; linear with chunk size. Acceptable, not streaming. |
| P4 | [`getMonthDetailsBatch`](src/lib/db/staff.ts) | Called three times per bulk job: once in each chunk (via `generateMonthDetailFiles`), once in `runBulkExport` size-reveal, once in `finalizeBulkExport` for notification. P2 is already using the narrower `listDispatcherIdsForMonth()` — chunk path does not. |
| P5 | No caching whatsoever | Every download regenerates. Users who re-download the same month during audit/verification pay full cost every time. **This is the core optimization opportunity.** |

---

## 4. Recommended architecture — R2-cached PDFs

Per the agreed design (user confirmed):

- **Canonical, shared cache** per `{agentId, year, month, salaryRecordId}` — multiple users clicking the same month reuse the same blob.
- **Staleness on name/branch rename is acceptable** until the next edit/recalculate.
- **Invalidate only on the events that actually change PDF content:** upload confirm (creates fresh), recalculate (modifies tier breakdown / `isBonusTier` flags), upload replace (cascade delete → record IDs change).
- **Eager pre-gen after confirm AND after recalculate** via QStash fire-and-forget → PDFs ready within ~1 min of the mutation.
- **Lazy fallback** — if a download request hits a record without a cached blob, generate on demand AND write to the cache.

**Cache keys** (all under `payroll-cache/` prefix, separate from the existing `bulk-exports/` pointer blobs that expire in 30 days):

```
payroll-cache/{agentId}/{year}-{mm}/{salaryRecordId}.pdf
payroll-cache/{agentId}/{year}-{mm}/{salaryRecordId}.csv
payroll-cache/{agentId}/{year}-{mm}/details.pdf.zip
payroll-cache/{agentId}/{year}-{mm}/details.csv.zip
```

**Invalidation events:**

| Event | Action |
|---|---|
| Upload `SAVED` (first confirm) | Enqueue prewarm job → generate all per-dispatcher + ZIP |
| Recalculate success | Delete stale blobs for affected `salaryRecordId`s + delete ZIP → enqueue prewarm for affected IDs + ZIP rebuild |
| Upload replace (cascade delete `SalaryRecord`) | No action — the record IDs change so old keys become naturally orphaned; R2 lifecycle cleans them up |
| Dispatcher rename / branch reassignment | **Intentionally ignored** — acceptable staleness |

Detailed flow, file changes, and testing plan in the spec: [`context/features/pdf-cache-spec.md`](context/features/pdf-cache-spec.md).

---

## 5. Priority order

1. **B1, B4** (atomic chunk state) — foundational correctness; cache layer depends on reliable `r2Key` writes.
2. **Cache layer spec** (see spec.md) — biggest user-visible win; partially obsoletes B9.
3. **B3, B5, B6** — safety hardening, low effort.
4. **B2, B7, B8, P2, P3, P4** — polish, revisit once cache layer lands and traffic patterns stabilize.

---

## 6. How to verify fixes

- Unit tests already exist for [`buildTierBreakdown`](src/lib/staff/__tests__/month-detail.test.ts), [`bulk-progress`](src/lib/staff/__tests__/bulk-progress.test.ts), [`bulk-chunks`](src/lib/staff/__tests__/bulk-chunks.test.ts), [`run-pool`](src/lib/upload/__tests__/run-pool.test.ts).
- Add tests for: cache key builder, cache read-through wrapper, invalidation on recalculate, prewarm dispatcher.
- E2E smoke: trigger a bulk job on dev (inline path), then a second identical job — second job should return `status: "done"` immediately without regenerating.
- Load test: hit `/api/staff/[id]/history/[salaryRecordId]/export/pdf` 50 times in a loop. First call ~3–15 s; subsequent calls ≤ 500 ms (R2 stream TTFB).

---

## 7. Out of scope

- Switching from `pdfkit` back to `@react-pdf/renderer` (abandoned earlier for perf reasons — current generator is faster).
- Reducing `pdfkit` memory via true streaming — deferred (B8).
- Pre-computing tier breakdown server-side and storing on `SalaryRecord` — would remove one source of regen cost but is a schema change; not worth it if blobs are cached.
