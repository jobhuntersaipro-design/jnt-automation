# PDF Generation Refactor — Kill Prewarm, Standardise on pdfkit

> **Status:** Draft · 2026-04-24
> **Supersedes:** `pdf-download-prewarm-ux-spec.md` (the Prewarm UX work being torn out)
> **One-line:** Delete the eager prewarm pipeline, port all `@react-pdf/renderer` call sites to `pdfkit`, and rely on the existing cache + async-job plumbing for anything expensive.

---

## 1. Goal

Stop burning Lambda minutes regenerating PDFs users never download. Stop having two PDF libraries. Keep the fast path (cache hit → 302 → R2 presigned URL) exactly as it is today.

Concretely:
- Delete the prewarm fan-out system end-to-end (triggered on every recalculate + confirm, generates every dispatcher's PDF + CSV + both bulk ZIPs up-front, bills QStash + Lambda time whether or not anyone downloads).
- Replace `@react-pdf/renderer` with `pdfkit` everywhere it's used so the codebase has one PDF library.
- Leave per-record PDFs **synchronous on cache miss** — Pro plan's 60 s ceiling handles pdfkit's worst observed case (~30 s for a 2 500-parcel dispatcher) with margin, and the bulk ZIP job pattern already covers anything fan-out-scale.

## 2. Non-Goals

Explicitly ruled out; do not touch under this feature:

- **Bulk month-detail ZIP pipeline** ([bulk-export-worker.ts](../../src/lib/staff/bulk-export-worker.ts), [bulk-finalize.ts](../../src/lib/staff/bulk-finalize.ts), chunk + finalize routes). Already async-job-based, already streams via `archiver` + `@aws-sdk/lib-storage`. Untouched.
- **The `payroll-cache/` R2 layout and `pdf-cache.ts` helpers.** Cache keys, write-through, invalidation all stay. Prewarm is the only thing being deleted; the cache it wrote into remains the canonical store, populated lazily on cache miss instead of eagerly after every mutation.
- **CSV generation paths.** CSVs stay read-through-cache exactly as they are.
- **Any new "merged branch PDF" surface.** Scope is removal + port, not new features.
- **Vercel plan migration.** Spec assumes Pro (60 s `maxDuration`). If you ever move to Hobby this decision re-opens.

## 3. Current State Snapshot

| Layer | File(s) | Action in this feature |
|---|---|---|
| Prewarm fan-out | [src/lib/staff/prewarm.ts](../../src/lib/staff/prewarm.ts) | **Delete** |
| Prewarm state store | [src/lib/staff/prewarm-job.ts](../../src/lib/staff/prewarm-job.ts) | **Delete** |
| Prewarm worker route | [src/app/api/payroll-cache/prewarm/route.ts](../../src/app/api/payroll-cache/prewarm/route.ts) | **Delete** |
| Prewarm status route | [src/app/api/payroll-cache/status/route.ts](../../src/app/api/payroll-cache/status/route.ts) | **Delete** |
| Prewarm hook | [src/lib/hooks/use-prewarm-status.ts](../../src/lib/hooks/use-prewarm-status.ts) | **Delete** |
| Download-button state helper | [src/lib/staff/download-button-state.ts](../../src/lib/staff/download-button-state.ts) (or wherever `computeDownloadButtonState` landed) | **Delete** |
| Shared `<PrewarmIndicator>` component | under `src/components/staff/` | **Delete** |
| `enqueuePrewarm` calls after confirm + recalc | [confirm/route.ts](../../src/app/api/upload/[uploadId]/confirm/route.ts), [recalculate/route.ts](../../src/app/api/payroll/upload/[uploadId]/recalculate/route.ts) | **Delete** (keep the `deleteCachedBlobs` call right before them — cache-bust is still required) |
| `seedPrewarmQueued()` seeding | same two routes | **Delete** |
| Progress UI on payroll-history `Line items` button | [payroll-history.tsx](../../src/components/payroll/payroll-history.tsx) | **Refactor** — revert to the pre-prewarm pattern (button always enabled, click kicks off the `BulkJob` which already exists) |
| Progress UI on month-detail PDF button | [month-detail-client.tsx](../../src/components/staff/month-detail-client.tsx) | **Revert** — button always enabled; click hits `/api/staff/[id]/history/[salaryRecordId]/export/pdf` (cache hit → instant 302; cache miss → synchronous pdfkit write-through) |
| `@react-pdf/renderer` — payslip | [src/lib/staff/payslip-generator.ts](../../src/lib/staff/payslip-generator.ts) | **Port to pdfkit** |
| `@react-pdf/renderer` — summary table | [src/lib/pdf/summary-table.tsx](../../src/lib/pdf/summary-table.tsx) | **Port to pdfkit** |
| `@react-pdf/renderer` dependency | `package.json` | **Remove** after all call sites migrated |
| Month-detail PDF (`pdfkit`) | [src/lib/staff/month-detail-pdf.ts](../../src/lib/staff/month-detail-pdf.ts) | Untouched — already pdfkit |
| Cache layer | [src/lib/staff/pdf-cache.ts](../../src/lib/staff/pdf-cache.ts) | Untouched |
| Bulk ZIP job | [bulk-job.ts](../../src/lib/staff/bulk-job.ts), [bulk-export-worker.ts](../../src/lib/staff/bulk-export-worker.ts), [bulk-finalize.ts](../../src/lib/staff/bulk-finalize.ts) | Untouched |

## 4. Design

### 4.1 Prewarm removal

Cache invalidation stays; eager regeneration goes.

**In [confirm/route.ts](../../src/app/api/upload/[uploadId]/confirm/route.ts) and [recalculate/route.ts](../../src/app/api/payroll/upload/[uploadId]/recalculate/route.ts):**

```ts
// BEFORE
await deleteCachedBlobs(cacheKeysForRecords(affectedRecords, agentId, year, month));
await seedPrewarmQueued(agentId, year, month, { reason: "recalculate" });
enqueuePrewarm({ agentId, year, month, dispatcherIds, reason: "recalculate" });

// AFTER
await deleteCachedBlobs(cacheKeysForRecords(affectedRecords, agentId, year, month));
// no enqueue — next download regenerates on demand
```

Net effect: after confirm/recalc, the first user who clicks Download pays the generation cost (streamed write-through to R2). Subsequent clicks hit the cache. If nobody clicks, no generation happens. Ever.

### 4.2 Per-record month-detail PDF — stays synchronous

Current behaviour is already correct for the Pro plan:

- Cache hit → 302 redirect to R2 presigned URL. Response in <100 ms.
- Cache miss → pdfkit generates inline → streams through a `PassThrough` to both the HTTP response (Node `Readable.toWeb`) and to R2 via `@aws-sdk/lib-storage` `Upload` (write-through). Worst-case ~30 s; well under 60 s `maxDuration`.

No changes to this route. The only delta is the UI: the button no longer grey-outs based on prewarm state; it's always enabled. On cache miss the user sees a ~5–30 s browser download spinner, which is fine — it's the original pre-prewarm behaviour, and it's a rare path (first click after recalc).

If the generation exceeds 60 s for a pathological dispatcher (>5 000 parcels?), the response fails and the user retries. That's a real but very-low-probability failure mode; we accept it rather than adding a job queue for a path measured at 2–30 s.

### 4.3 Bulk ZIP — unchanged behaviourally, UI re-sourced

The bulk month-detail ZIP download continues to be a `BulkJob` via QStash fan-out. The only change is that its progress indicator in the [payroll-history.tsx](../../src/components/payroll/payroll-history.tsx) row and in the Downloads Centre ([downloads-panel.tsx](../../src/components/dashboard/downloads-panel.tsx)) already reads from `BulkJob` state — nothing to change there.

Where the Prewarm UX feature leaned on `PrewarmState.status` to gate the `Line items ▾` dropdown's "PDF zip" entry, we revert to the older "always-enabled, click creates a job, watch the bell ring" flow. That flow shipped on 2026-04-22 and worked fine.

### 4.4 `@react-pdf/renderer` → `pdfkit` port

Two modules to rewrite.

**[summary-table.tsx](../../src/lib/pdf/summary-table.tsx)** — consumed by three routes:
- `/api/payroll/upload/[uploadId]/export/pdf` (per-month dispatcher table)
- `/api/staff/[id]/export/pdf` (dispatcher YTD history)
- `/api/overview/export/pdf` (overview dispatcher + branch summary)

Build a pure-pdfkit equivalent in `src/lib/pdf/summary-table-pdfkit.ts` that exports a single function:

```ts
export async function renderSummaryTablePdf(input: {
  title: string;
  subtitle?: string;
  columns: Array<{ key: string; label: string; align?: "left" | "right"; width?: number }>;
  rows: Array<Record<string, string | number>>;
  totalsRow?: Record<string, string | number>;
}): Promise<Buffer>;
```

Landscape A4, Helvetica for labels, Courier for numbers, header + table + page numbers. Returns a full `Buffer` (these PDFs are small — tens of KB — so streaming isn't necessary; matches the `renderToBuffer()` return shape the callers already expect).

**[payslip-generator.ts](../../src/lib/staff/payslip-generator.ts)** — consumed by:
- `/api/payroll/upload/[uploadId]/export/pdf` (single-employee payslip)
- `/api/employee-payroll/[m]/[y]/payslip/[employeeId]` (single)
- `/api/employee-payroll/[m]/[y]/payslips` (bulk ZIP, via `payslip-bulk-worker.ts`)
- `/api/payroll/upload/[uploadId]/payslips` (bulk ZIP, same worker family)

Three templates (Supervisor/Admin, Store Keeper, Combined Dispatcher+Employee). Each has a specific two-column layout with particulars panel, addition/deduction table, employer-contribution + net-pay footer, and a company stamp bottom-right.

Port approach: mechanical translation of the existing React-tree layout into pdfkit imperative draw calls. Keep the same input contract (`EmployeePayslipInput`) so the two worker routes don't care which library ran. Reuse the font registration + currency formatting utilities already in `month-detail-pdf.ts`.

Acceptance: visual diff ≤ 5 px drift on each of the three templates against the current React-PDF output. Easiest check: generate same payslip with both implementations during the port, put them side-by-side in a PR screenshot.

**Remove `@react-pdf/renderer` from `package.json` dependencies** once all three `renderToBuffer` call sites are ported and the old `.tsx` files deleted.

### 4.5 No UI state-machine logic left in the client

`computeDownloadButtonState(prewarm)` and its seven unit tests disappear. The `<PrewarmIndicator>` component disappears. `month-detail-client.tsx` [handlePdf](../../src/components/staff/month-detail-client.tsx#L159) reverts to the simpler version — always-enabled button, `toast.error` on HTTP failure, no progress polling.

## 5. Implementation Order

Removal-first, port-second, cleanup-last. Each step leaves the tree building and deployable.

1. **RED tests first where they still matter.** Write 1 failing test per ported module (`summary-table-pdfkit` + `payslip-generator-pdfkit`) asserting the returned `Buffer` starts with `%PDF-` and contains the title + at least one row value as a substring. That's the green-to-green check; mechanical port = green.
2. **Delete prewarm calls from `confirm` and `recalculate` routes.** Keep `deleteCachedBlobs`. Build passes (prewarm module still exists, just unused). Ship-able.
3. **Revert UI:**
   - `month-detail-client.tsx` → drop `usePrewarmStatus` import + `<PrewarmIndicator>` render, restore the pre-prewarm `handlePdf`.
   - `payroll-history.tsx` → drop the prewarm-driven gating on the `Line items ▾` PDF zip entry.
   - Delete `<PrewarmIndicator>` component file.
   - Delete `download-button-state.ts` + its `.test.ts`.
4. **Delete prewarm backend:**
   - `src/lib/staff/prewarm.ts`
   - `src/lib/staff/prewarm-job.ts`
   - `src/app/api/payroll-cache/prewarm/route.ts`
   - `src/app/api/payroll-cache/status/route.ts`
   - `src/lib/hooks/use-prewarm-status.ts`
   - Their associated test files.
   - `grep -r 'prewarm' src/` should come back empty apart from this spec's history entry when it's written.
5. **Port `summary-table` to pdfkit** → new `src/lib/pdf/summary-table-pdfkit.ts` exporting `renderSummaryTablePdf()`. Swap the three import sites (`/api/payroll/upload/.../export/pdf`, `/api/staff/[id]/export/pdf`, `/api/overview/export/pdf`) to the new function. Delete `src/lib/pdf/summary-table.tsx`.
6. **Port `payslip-generator` to pdfkit** → new `src/lib/staff/payslip-generator-pdfkit.ts` exporting the same function signatures. Swap the four import sites. Delete the old `.tsx` templates.
7. **Remove dependency:** `npm uninstall @react-pdf/renderer`. Run `npm run build` + `npm run test`. Grep the repo for any remaining `@react-pdf/renderer` import — should be zero.
8. **Manual smoke** against dev:
   - Upload → confirm → no prewarm job fires in QStash logs (was firing 1 per confirm previously).
   - Recalculate → no prewarm job. `payroll-cache/.../{recordId}.pdf` blob is **deleted** in R2 (cache-bust still works).
   - Click month-detail PDF on a just-recalculated record → button responds immediately, spinner during pdfkit generation (5–30 s), file downloads, blob appears in R2.
   - Click same PDF again → 302 redirect to presigned URL, download in <1 s (cache hit).
   - Trigger bulk month-detail ZIP from payroll-history row → notification bell ring animates → completes → download works (unchanged path, regression check).
   - Overview export → PDF + CSV both download (tests the summary-table port).
   - Payslip generation from payroll page → single + bulk ZIP both work (tests the payslip port).

## 6. Acceptance

- `grep -ri 'prewarm\|PrewarmState\|PrewarmIndicator' src/` returns nothing.
- `grep -ri "@react-pdf/renderer" .` returns nothing (outside `node_modules` which is gone post-uninstall anyway).
- `package.json` no longer lists `@react-pdf/renderer`.
- All 8 manual smoke steps above pass.
- `npm run build` + `npm run test` clean.
- QStash dashboard: zero prewarm-related messages published over a 24 h window post-deploy.
- Vercel function invocation count on confirm + recalculate routes drops (eyeball before/after in dashboard — the prewarm worker invocations disappear entirely).

## 7. Risk & Rollout

**Risk 1 — slow first download after recalc.**
Mitigation: write-through cache means only the first user per record pays the cost. A 30 s one-off download on the rare month-with-huge-dispatchers case is strictly better UX than prewarm's "your confirm just took 45 s and used 50 Lambda-minutes whether or not you'll ever click Download."

**Risk 2 — >60 s generation on pathological dispatcher.**
Not observed in prod data (current max ~30 s at 2 500 parcels). If it happens, the response fails cleanly, user retries, second attempt hits cache partially if R2 write completed. Accepted. If we ever hit this in the wild, the fix is to job-ify per-record using the existing `BulkJob` model — tracked as a follow-up only if triggered.

**Risk 3 — payslip pdfkit port visual drift.**
Mitigation: side-by-side screenshot in PR description covering all three templates. Accept ≤ 5 px drift. Landlord's fonts identical (Helvetica + Courier). Table + particulars layouts are pure positional math — pdfkit is a closer match to "boxes and text" than the React-PDF flex layout was.

**Rollout:**
Single PR. No schema migration. No env changes. Prewarm's Redis keys (`prewarm:state:*`) expire naturally within 30 days; no cleanup required, but a one-off `SCAN` + `DEL` script can run post-deploy to reclaim memory immediately if desired.

**Reversibility:**
Prewarm code deleted in one commit; revert restores it entirely. The `payroll-cache/` R2 layout is unchanged, so post-revert prewarm would repopulate the same keys the on-demand path is writing.

## 8. Out of scope (filed as follow-ups if triggered)

- Per-record PDF async-job conversion (only needed if 60 s ceiling bites in prod — not today).
- Alternative PDF library for speed wins beyond pdfkit (e.g. `@pdfme/generator`) — pdfkit is fast enough and already in the tree.
- HTML-to-PDF path (Puppeteer on a DO droplet) — mentioned in the brief but unnecessary; the current designs are all data-driven tables, not HTML layouts.
