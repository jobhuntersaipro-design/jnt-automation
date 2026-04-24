# PDF Line-Items Pre-Store (R2 Cache Layer) — Spec

**Status:** Draft · awaiting user approval before implementation
**Related audit:** [`docs/audit-results/PDF_LINE_ITEMS_DOWNLOAD_AUDIT.md`](../../docs/audit-results/PDF_LINE_ITEMS_DOWNLOAD_AUDIT.md)

---

## 1. Problem

Every PDF / CSV / ZIP download today regenerates from scratch:

- **Single dispatcher-month PDF** — 3–15 s per click, blocks a Vercel request Lambda.
- **Bulk per-month ZIP** — 30–90 s, already backgrounded but costs full compute on every click.

Users frequently re-download the same month during payroll verification. Content changes are rare (only on recalculate / replace). This is a textbook cache.

## 2. Goals

- Sub-second download for any previously-generated PDF / CSV / ZIP.
- Transparent: no UI change for users, same routes, same filenames.
- Eager prewarm after mutations — cache is hot by the time the user clicks.
- Safe: stale cache never served; invalidation is synchronous with the mutation that changes content.
- Shared per agent-month — one blob serves every click from every tab.

## 3. Non-goals

- Reducing `pdfkit` generation time itself (separate optimization).
- Caching data that changes on name/branch rename (intentional staleness).
- Cross-agent sharing (agents never share blobs).
- Durable history of previous cache versions.

---

## 4. Design

### 4.1 Canonical cache keys

```
payroll-cache/{agentId}/{year}-{mm}/{salaryRecordId}.pdf
payroll-cache/{agentId}/{year}-{mm}/{salaryRecordId}.csv
payroll-cache/{agentId}/{year}-{mm}/details.pdf.zip
payroll-cache/{agentId}/{year}-{mm}/details.csv.zip
```

- `{mm}` is zero-padded (`03`, not `3`).
- `salaryRecordId` is the cuid — changes on upload replace, so replace naturally invalidates.
- Separate prefix from `bulk-exports/` (which stays the per-job pointer store with 30-day TTL).
- **No R2 lifecycle rule** on `payroll-cache/` — blobs persist as long as the record exists. If a record is deleted (cascade from upload delete), we explicitly delete the blob in the same handler.

### 4.2 Cache read-through helper

New module `src/lib/staff/pdf-cache.ts`:

```ts
export async function getCachedPdf(key: string): Promise<ReadableStream | null>
export async function putCachedPdf(key: string, bytes: Buffer | Uint8Array): Promise<void>
export async function streamCachedZip(key: string): Promise<Response | null>
export async function deleteCachedBlobs(keys: string[]): Promise<void>

export function pdfKey(agentId: string, year: number, month: number, salaryRecordId: string): string
export function csvKey(agentId: string, year: number, month: number, salaryRecordId: string): string
export function zipKey(agentId: string, year: number, month: number, format: "pdf" | "csv"): string
```

- `getCachedPdf` does a `HeadObjectCommand` first; returns null on 404, throws on other errors.
- `putCachedPdf` uses `PutObjectCommand` directly (no multipart — single PDF is ≤ 2 MB).
- `streamCachedZip` uses `GetObjectCommand` + `Readable.toWeb()` same as the existing bulk download route.

### 4.3 Route changes (lazy fallback)

[`GET /api/staff/[id]/history/[salaryRecordId]/export/pdf`](../../src/app/api/staff/[id]/history/[salaryRecordId]/export/pdf/route.ts):

```
1. Auth + ownership check (unchanged)
2. Build cache key from resolved agentId/year/month/salaryRecordId
3. Try getCachedPdf(key) → if present, stream it back + return
4. (cache miss) Generate via existing generateMonthDetailPdf(...)
5. putCachedPdf(key, buffer) (fire-and-forget, don't block response)
6. Return the generated buffer as today
```

Same pattern for `.../export/csv`.

[`POST /api/dispatchers/month-detail/bulk/start`](../../src/app/api/dispatchers/month-detail/bulk/start/route.ts):

```
1. Auth + input validation (unchanged)
2. Build zipKey(agentId, year, month, format)
3. If HeadObject succeeds → create a "short-circuit" BulkJob pre-marked status=done
   with r2Key=cached key, return jobId immediately. Client polls /status once,
   sees done, downloads.
4. Else → existing dispatchBulkExport() path, but runBulkExport / finalize
   write to the canonical key instead of the per-job path.
```

The existing `/bulk/[jobId]/download` route does NOT need changes — it streams whatever `job.r2Key` points to.

### 4.4 Prewarm on upload confirm

New QStash producer call at the tail of the upload confirm handler (wherever the upload transitions to `SAVED`). Find it via `grep -rn "status: .SAVED" src/app/api/upload/`.

```ts
await enqueuePrewarm({
  agentId,
  year: upload.year,
  month: upload.month,
  reason: "upload-confirmed",
})
```

New endpoint `POST /api/payroll-cache/prewarm` (QStash-signed):

```
1. Verify QStash signature via verifySignatureAppRouter
2. List all SalaryRecord ids for (agentId, year, month)
3. For each id: generate PDF + CSV via generateMonthDetailFiles,
   putCachedPdf/Csv on the canonical keys.
4. Build ZIP (PDF) + ZIP (CSV) via streamZipToR2() to the canonical ZIP keys.
5. No user notification — silent warm-up.
```

Concurrency + memory tuning: reuse `runPool` with the existing 4-PDF / 8-CSV concurrency constants.

Runtime budget: `maxDuration = 600` (same as finalize). Safety fallback: if the prewarm Lambda times out, the lazy fallback on first user click still works — the cache just isn't warm yet.

### 4.5 Invalidation on recalculate

Edit [`/api/payroll/upload/[uploadId]/recalculate/route.ts`](../../src/app/api/payroll/upload/[uploadId]/recalculate/route.ts) to add, right before `revalidatePath(...)`:

```ts
const affectedRecordIds = updates
  .map((u) => recordByDispatcher.get(u.dispatcherId)?.id)
  .filter(Boolean) as string[];

const keysToDelete = [
  ...affectedRecordIds.flatMap((id) => [
    pdfKey(agentId, upload.year, upload.month, id),
    csvKey(agentId, upload.year, upload.month, id),
  ]),
  zipKey(agentId, upload.year, upload.month, "pdf"),
  zipKey(agentId, upload.year, upload.month, "csv"),
];
await deleteCachedBlobs(keysToDelete);
await enqueuePrewarm({ agentId, year: upload.year, month: upload.month, reason: "recalculate" });
```

Delete is synchronous with the response so there's no window where a stale cache can be served after the user sees "Saved". Prewarm re-populates async.

### 4.6 Invalidation on upload replace / delete

Edit the upload replace + delete handlers (wherever `SalaryRecord.deleteMany({ where: { uploadId } })` is called) to also:

```ts
// BEFORE the delete — we need the record ids
const recordsToEvict = await prisma.salaryRecord.findMany({
  where: { uploadId }, select: { id: true },
});
await deleteCachedBlobs([
  ...recordsToEvict.flatMap((r) => [
    pdfKey(agentId, upload.year, upload.month, r.id),
    csvKey(agentId, upload.year, upload.month, r.id),
  ]),
  zipKey(agentId, upload.year, upload.month, "pdf"),
  zipKey(agentId, upload.year, upload.month, "csv"),
]);
// existing cascade deleteMany follows
```

R2 `DeleteObjects` supports up to 1000 keys per call — cap batch size at 1000 and loop.

---

## 5. Files to add / modify

**New:**

- `src/lib/staff/pdf-cache.ts` — key builders + read/write/delete helpers.
- `src/lib/staff/prewarm-dispatcher.ts` — QStash publish wrapper.
- `src/app/api/payroll-cache/prewarm/route.ts` — QStash-signed worker.
- `src/lib/staff/__tests__/pdf-cache.test.ts` — key-builder tests + read-through mock.

**Modify:**

- `src/app/api/staff/[id]/history/[salaryRecordId]/export/pdf/route.ts` — read-through + lazy write.
- `src/app/api/staff/[id]/history/[salaryRecordId]/export/csv/route.ts` — same.
- `src/app/api/dispatchers/month-detail/bulk/start/route.ts` — canonical key + short-circuit on hit.
- `src/lib/staff/bulk-export-worker.ts` — `runBulkExport` writes to canonical ZIP key.
- `src/lib/staff/bulk-finalize.ts` — `finalizeBulkExport` writes to canonical ZIP key.
- `src/app/api/payroll/upload/[uploadId]/recalculate/route.ts` — invalidation + prewarm.
- Upload confirm handler (wherever `UploadStatus.SAVED` is set) — enqueue prewarm.
- Upload replace / delete handlers — invalidation.

**Pre-req fixes (from audit §2 — land these first):**

- B1 + B4 (atomic chunk state) — otherwise finalize may write a ZIP to the canonical key that's missing chunks.

---

## 6. Tests

Unit:

- `pdfKey`, `csvKey`, `zipKey` build expected strings for known inputs.
- `getCachedPdf` returns null on 404, throws on 500.
- `deleteCachedBlobs` batches >1000 keys across multiple R2 calls.
- Prewarm worker: mock `getMonthDetailsBatch`, assert it calls `putCachedPdf` exactly once per record + writes the two ZIP keys.

Integration (dev Neon + real R2):

1. Fresh upload confirm → poll the prewarm job → HEAD each canonical key → expect 200.
2. Click single-PDF download → expect TTFB < 500 ms (cache hit).
3. Recalculate one dispatcher → HEAD that dispatcher's PDF key → expect 404 momentarily → re-fire prewarm → expect 200.
4. Trigger two parallel `/bulk/start` POSTs for the same month → both should short-circuit to the same canonical ZIP → no duplicate jobs.

E2E smoke in Playwright: add one test to `e2e/smoke.spec.ts` that confirms "Detail" → "Download PDF" on a known month serves from R2 on the second click (check a response header flag `x-payroll-cache: hit`).

---

## 7. Observability

- Add `x-payroll-cache: hit | miss | stored` response header on the single-PDF / CSV routes.
- Log `[pdf-cache] hit/miss/stored key={...}` at info level (redact agentId to last 4 chars).
- On prewarm success, write a `notifications` row of type `"debug"` (internal, hidden from UI) with `{ count, ms }` for traceability. Or skip and rely on Vercel logs.

## 8. Rollout

1. Land B1 + B4 fixes (atomic chunk state).
2. Land the cache module + key builders + unit tests.
3. Land lazy read-through on the two single routes (low risk — no new write path on the hot path).
4. Land the `/bulk/start` short-circuit + canonical ZIP key writes in worker/finalize.
5. Land the prewarm worker.
6. Land invalidation on recalculate + upload confirm/replace/delete.
7. Monitor R2 storage growth + cache-hit ratio for a week.

Each step is independently revertable. Step 3 alone already gives the "second click is fast" experience even without prewarm.

## 9. Open questions (confirm before coding)

- Should `.csv` also get the short-circuit treatment, or only `.pdf`? (CSV gen is already fast — string concat, ~100 ms. Skipping simplifies the worker.)
- Should prewarm wait for the confirm DB transaction to commit, or run in parallel? Current plan is to enqueue after the response is sent; QStash delivery latency (~1–5 s) gives the DB time to settle.
- Do we want a manual "Rebuild cache" button in the dispatcher history drawer for admin use, or is the lazy fallback sufficient for emergencies?

---

## 10. Size estimate

- ~400 LOC new, ~150 LOC modified.
- 3–4 days including tests + a half-day Playwright smoke run against dev.
- Independent of the `DispatcherAssignment` schema landed in April — no schema changes required.
