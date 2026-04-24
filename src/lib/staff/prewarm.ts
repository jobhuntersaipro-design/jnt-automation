import { Client } from "@upstash/qstash";
import { streamZipToR2 } from "./streaming-zip";
import {
  generateMonthDetailFiles,
  listDispatcherIdsForMonth,
} from "./month-detail-files";
import { csvKey, pdfKey, putCached, zipKey } from "./pdf-cache";
import { monthDetailFilename } from "./month-detail-filename";

const qstash = new Client({ token: process.env.QSTASH_TOKEN ?? "" });

export interface PrewarmPayload {
  agentId: string;
  year: number;
  month: number;
  /** Free-form label surfaced in logs — "upload-confirmed", "recalculate", … */
  reason: string;
  /**
   * Optional — when set, only files for these dispatchers are regenerated
   * in the per-dispatcher pass. The bulk ZIPs are always rebuilt from all
   * records for the month so the canonical ZIP stays consistent with the
   * per-record cache.
   */
  dispatcherIds?: string[];
}

/**
 * Fire-and-forget publish to the prewarm worker. Returns after the QStash
 * API has accepted the message. Caller should `.catch()` on the returned
 * promise and log failures — a missed prewarm is not fatal; the lazy
 * read-through on the first user click will populate the cache anyway.
 *
 * In dev (no QSTASH_TOKEN) we run the worker inline on the event loop so
 * local testing still exercises the code path. Consistent with
 * `dispatchBulkExport`'s dev behaviour.
 */
export async function enqueuePrewarm(payload: PrewarmPayload): Promise<void> {
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev || !process.env.QSTASH_TOKEN || !process.env.NEXT_PUBLIC_APP_URL) {
    // Inline — runs in the current Lambda/dev-server process.
    Promise.resolve()
      .then(() => runPrewarm(payload))
      .catch((e) => console.error("[prewarm] inline failed:", e));
    return;
  }
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/payroll-cache/prewarm`;
  await qstash.publishJSON({ url, body: payload, retries: 2 });
}

/**
 * Entry point called by the QStash-signed worker route + the dev inline
 * path. Generates per-dispatcher PDF + CSV for the month and writes both
 * bulk ZIPs — all under the canonical `payroll-cache/` prefix.
 */
export async function runPrewarm(payload: PrewarmPayload): Promise<void> {
  const { agentId, year, month, reason, dispatcherIds } = payload;
  const start = Date.now();

  const ids = await listDispatcherIdsForMonth(agentId, year, month);
  if (ids.length === 0) {
    console.log(`[prewarm] ${agentId} ${year}-${month} ${reason}: no records`);
    return;
  }

  // Generate PDFs + CSVs for the (optionally narrowed) set of dispatchers.
  // `generateMonthDetailFiles` batches the Prisma fetch and renders in
  // parallel via runPool (PDF=4, CSV=8).
  const pdfFiles = await generateMonthDetailFiles({
    agentId,
    year,
    month,
    format: "pdf",
    dispatcherIds: dispatcherIds, // null/undefined means all
  });
  const csvFiles = await generateMonthDetailFiles({
    agentId,
    year,
    month,
    format: "csv",
    dispatcherIds: dispatcherIds,
  });

  // We need the salaryRecordId for the per-file cache key, but
  // generateMonthDetailFiles returns only fileName+data. Rebuild the
  // mapping via listDispatcherIdsForMonth and the filename convention.
  // Simpler: fetch the SalaryRecord ids and write the cache under those
  // keys directly here.
  const { prisma } = await import("@/lib/prisma");
  const records = await prisma.salaryRecord.findMany({
    where: {
      year,
      month,
      dispatcher: { branch: { agentId } },
      ...(dispatcherIds?.length
        ? { dispatcherId: { in: dispatcherIds } }
        : {}),
    },
    select: { id: true, dispatcher: { select: { name: true } } },
  });
  const idByFileName = new Map<string, string>();
  for (const r of records) {
    idByFileName.set(monthDetailFilename(year, month, r.dispatcher.name, "pdf"), r.id);
    idByFileName.set(monthDetailFilename(year, month, r.dispatcher.name, "csv"), r.id);
  }

  // Per-file cache writes, parallel. R2 PUTs are ~300 ms each.
  await Promise.all(
    pdfFiles.map(async (f) => {
      const id = idByFileName.get(f.fileName);
      if (!id) return;
      await putCached(
        pdfKey(agentId, year, month, id),
        f.data as Uint8Array,
        "application/pdf",
      );
    }),
  );
  await Promise.all(
    csvFiles.map(async (f) => {
      const id = idByFileName.get(f.fileName);
      if (!id) return;
      await putCached(
        csvKey(agentId, year, month, id),
        f.data as string,
        "text/csv; charset=utf-8",
      );
    }),
  );

  // Bulk ZIPs — always regenerated from the full month, even on a narrow
  // recalculate prewarm, so the canonical ZIP stays in sync with the
  // per-dispatcher cache. Skipping this on narrowed payloads would leave
  // stale per-record files inside the ZIP.
  if (dispatcherIds) {
    const allPdf = await generateMonthDetailFiles({ agentId, year, month, format: "pdf" });
    const allCsv = await generateMonthDetailFiles({ agentId, year, month, format: "csv" });
    await streamZipToR2(zipKey(agentId, year, month, "pdf"), allPdf);
    await streamZipToR2(zipKey(agentId, year, month, "csv"), allCsv);
  } else {
    // We already have every file from the initial generation pass — reuse.
    await streamZipToR2(zipKey(agentId, year, month, "pdf"), pdfFiles);
    await streamZipToR2(zipKey(agentId, year, month, "csv"), csvFiles);
  }

  const ms = Date.now() - start;
  console.log(
    `[prewarm] ${agentId} ${year}-${month} ${reason}: ${pdfFiles.length} PDF + ${csvFiles.length} CSV + 2 ZIP · ${ms}ms`,
  );
}
