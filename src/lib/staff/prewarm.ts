import { Client } from "@upstash/qstash";
import { streamZipToR2 } from "./streaming-zip";
import {
  generateMonthDetailFiles,
  listDispatcherIdsForMonth,
} from "./month-detail-files";
import { csvKey, pdfKey, putCached, zipKey } from "./pdf-cache";
import { monthDetailFilename } from "./month-detail-filename";
import { splitDispatchers, DEFAULT_CHUNK_SIZE } from "./bulk-chunks";
import {
  createPrewarmJob,
  incrementPrewarmDone,
  incrementPrewarmDoneChunks,
  updatePrewarmJob,
} from "./prewarm-job";

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
   *
   * Ignored by the fan-out path — we always prewarm the full month when
   * QStash is available, because partial prewarm makes the cache status
   * indicator confusing (total vs done) and the narrow-case speedup is
   * marginal compared to the fan-out speedup.
   */
  dispatcherIds?: string[];
}

/**
 * Fire-and-forget prewarm trigger.
 *
 * Prod → fans out via QStash across N chunk workers (faster for 100+
 * dispatchers; each worker gets its own Lambda's CPU budget).
 * Dev → runs inline on the event loop (localhost + QStash don't mix).
 *
 * Returns after the dispatch call has been made. Errors from the fan-out
 * publish are logged but not thrown — a missed prewarm is non-fatal, the
 * first user click will populate the cache lazily instead.
 */
export async function enqueuePrewarm(payload: PrewarmPayload): Promise<void> {
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev || !process.env.QSTASH_TOKEN || !process.env.NEXT_PUBLIC_APP_URL) {
    Promise.resolve()
      .then(() => runPrewarmInline(payload))
      .catch((e) => console.error("[prewarm] inline failed:", e));
    return;
  }
  try {
    await startPrewarmFanout(payload);
  } catch (err) {
    console.error("[prewarm] fan-out dispatch failed:", err);
    // Fallback: hit the legacy inline worker route so the prewarm still
    // runs, just on a single Lambda.
    const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/payroll-cache/prewarm`;
    await qstash.publishJSON({ url, body: payload, retries: 2 }).catch(() => {});
  }
}

/**
 * Fan-out entry point: lists dispatchers, splits into chunks, publishes one
 * QStash message per chunk. The last chunk worker to finish publishes the
 * finalize message which assembles the two bulk ZIPs from the per-record
 * cache.
 */
export async function startPrewarmFanout(
  payload: PrewarmPayload,
): Promise<void> {
  const { agentId, year, month, reason } = payload;

  const ids = await listDispatcherIdsForMonth(agentId, year, month);
  if (ids.length === 0) {
    console.log(`[prewarm] ${agentId} ${year}-${month}: no records to warm`);
    return;
  }

  const chunks = splitDispatchers(ids, DEFAULT_CHUNK_SIZE);

  await createPrewarmJob({
    agentId,
    year,
    month,
    total: ids.length,
    totalChunks: chunks.length,
    reason,
  });
  await updatePrewarmJob(agentId, year, month, {
    status: "running",
    stage: "generating",
  });

  const workerUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/payroll-cache/prewarm/worker/chunk`;
  await Promise.all(
    chunks.map((c) =>
      qstash.publishJSON({
        url: workerUrl,
        body: {
          agentId,
          year,
          month,
          chunkIndex: c.index,
          dispatcherIds: c.dispatcherIds,
          totalChunks: chunks.length,
        },
        retries: 2,
      }),
    ),
  );
}

export interface PrewarmChunkPayload {
  agentId: string;
  year: number;
  month: number;
  chunkIndex: number;
  dispatcherIds: string[];
  totalChunks: number;
}

/**
 * Run one chunk of the prewarm fan-out. Generates per-record PDF+CSV for
 * the dispatchers in this slice, writes them to the `payroll-cache/`
 * prefix. The last chunk to finish publishes the finalize message.
 *
 * Idempotent — re-running on the same slice just overwrites identical
 * blobs. Safe under QStash retries.
 */
export async function runPrewarmChunk(
  payload: PrewarmChunkPayload,
): Promise<void> {
  const { agentId, year, month, dispatcherIds, totalChunks } = payload;

  try {
    const [pdfFiles, csvFiles] = await Promise.all([
      generateMonthDetailFiles({
        agentId,
        year,
        month,
        format: "pdf",
        dispatcherIds,
      }),
      generateMonthDetailFiles({
        agentId,
        year,
        month,
        format: "csv",
        dispatcherIds,
      }),
    ]);

    // Map filenames → salaryRecordId so we can write under the canonical
    // cache keys. Matches the legacy inline prewarm's logic.
    const { prisma } = await import("@/lib/prisma");
    const records = await prisma.salaryRecord.findMany({
      where: {
        year,
        month,
        dispatcherId: { in: dispatcherIds },
        dispatcher: { branch: { agentId } },
      },
      select: { id: true, dispatcher: { select: { name: true } } },
    });
    const idByFileName = new Map<string, string>();
    for (const r of records) {
      idByFileName.set(
        monthDetailFilename(year, month, r.dispatcher.name, "pdf"),
        r.id,
      );
      idByFileName.set(
        monthDetailFilename(year, month, r.dispatcher.name, "csv"),
        r.id,
      );
    }

    await Promise.all([
      ...pdfFiles.map(async (f) => {
        const id = idByFileName.get(f.fileName);
        if (!id) return;
        await putCached(
          pdfKey(agentId, year, month, id),
          f.data as Uint8Array,
          "application/pdf",
        );
      }),
      ...csvFiles.map(async (f) => {
        const id = idByFileName.get(f.fileName);
        if (!id) return;
        await putCached(
          csvKey(agentId, year, month, id),
          f.data as string,
          "text/csv; charset=utf-8",
        );
      }),
    ]);

    // Counter reflects "per-record files cached" (each dispatcher contributes
    // one PDF + one CSV). UI progress is (done / (total * 2)) if we want
    // to be precise, but rounding dispatcherIds.length gives the same UX
    // and matches the `total` field we stored at fan-out time.
    await incrementPrewarmDone(agentId, year, month, dispatcherIds.length);

    const doneChunks = await incrementPrewarmDoneChunks(agentId, year, month);
    if (doneChunks === totalChunks) {
      const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/payroll-cache/prewarm/worker/finalize`;
      await qstash.publishJSON({
        url,
        body: { agentId, year, month },
        retries: 2,
      });
    }
  } catch (err) {
    console.error(
      `[prewarm-chunk] ${agentId} ${year}-${month} chunk ${payload.chunkIndex} failed:`,
      err,
    );
    const message = err instanceof Error ? err.message : "Prewarm chunk failed";
    await updatePrewarmJob(agentId, year, month, {
      status: "failed",
      error: message,
    });
    throw err; // let QStash retry
  }
}

/**
 * Prewarm finalize worker. Pulls every per-record PDF/CSV blob from R2 for
 * this (agent, year, month) and builds the two bulk ZIPs at the canonical
 * cache keys. No regeneration — just a merge.
 *
 * Runs after the last chunk worker increments chunks-done. Idempotent —
 * re-running overwrites identical blobs.
 */
export async function runPrewarmFinalize(args: {
  agentId: string;
  year: number;
  month: number;
}): Promise<void> {
  const { agentId, year, month } = args;
  try {
    // Transition to "finalizing" immediately so the UI stops showing
    // "Generating 100%" and starts showing "Bundling ZIP…". Without this
    // the indicator stalls visibly while the two R2 fetches + merge run.
    await updatePrewarmJob(agentId, year, month, { stage: "finalizing" });

    const { prisma } = await import("@/lib/prisma");
    const records = await prisma.salaryRecord.findMany({
      where: {
        year,
        month,
        dispatcher: { branch: { agentId } },
      },
      select: { id: true, dispatcher: { select: { name: true } } },
      orderBy: { dispatcher: { name: "asc" } },
    });

    if (records.length === 0) {
      await updatePrewarmJob(agentId, year, month, {
        status: "done",
        stage: "done",
      });
      return;
    }

    // Pull every per-record cache blob in parallel, re-stream into the two
    // bulk ZIPs. R2 GETs are cheap relative to generation — this finalize
    // step is seconds even for 100+ dispatchers.
    const { r2, R2_BUCKET } = await import("@/lib/r2");
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");

    type Entry = { fileName: string; data: Buffer };

    async function fetchCached(
      key: string,
    ): Promise<Buffer | null> {
      try {
        const obj = await r2.send(
          new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
        );
        if (!obj.Body) return null;
        const chunks: Buffer[] = [];
        for await (const chunk of obj.Body as AsyncIterable<Buffer>) {
          chunks.push(chunk);
        }
        return Buffer.concat(chunks);
      } catch {
        return null;
      }
    }

    const pdfEntries: Array<Entry | null> = await Promise.all(
      records.map(async (r) => {
        const buf = await fetchCached(pdfKey(agentId, year, month, r.id));
        if (!buf) return null;
        return {
          fileName: monthDetailFilename(year, month, r.dispatcher.name, "pdf"),
          data: buf,
        };
      }),
    );
    const csvEntries: Array<Entry | null> = await Promise.all(
      records.map(async (r) => {
        const buf = await fetchCached(csvKey(agentId, year, month, r.id));
        if (!buf) return null;
        return {
          fileName: monthDetailFilename(year, month, r.dispatcher.name, "csv"),
          data: buf,
        };
      }),
    );

    const pdfReady = pdfEntries.filter((e): e is Entry => e !== null);
    const csvReady = csvEntries.filter((e): e is Entry => e !== null);

    // If a chunk worker silently failed and left gaps, we still want a ZIP
    // so users can download what's ready. But if nothing landed, surface
    // the failure instead of writing two empty zips.
    if (pdfReady.length === 0 && csvReady.length === 0) {
      await updatePrewarmJob(agentId, year, month, {
        status: "failed",
        error: "No per-record cache blobs were found — all chunks failed",
      });
      return;
    }

    await Promise.all([
      pdfReady.length > 0
        ? streamZipToR2(zipKey(agentId, year, month, "pdf"), pdfReady)
        : Promise.resolve(),
      csvReady.length > 0
        ? streamZipToR2(zipKey(agentId, year, month, "csv"), csvReady)
        : Promise.resolve(),
    ]);

    await updatePrewarmJob(agentId, year, month, {
      status: "done",
      stage: "done",
    });
  } catch (err) {
    console.error(`[prewarm-finalize] ${args.agentId} ${args.year}-${args.month}:`, err);
    const message = err instanceof Error ? err.message : "Prewarm finalize failed";
    await updatePrewarmJob(args.agentId, args.year, args.month, {
      status: "failed",
      error: message,
    });
    throw err;
  }
}

/**
 * Legacy inline prewarm — single-Lambda, used in dev and as a fallback
 * when the QStash fan-out dispatch fails. Kept here so the existing
 * `/api/payroll-cache/prewarm` route still works.
 */
export async function runPrewarmInline(
  payload: PrewarmPayload,
): Promise<void> {
  const { agentId, year, month, reason, dispatcherIds } = payload;
  const start = Date.now();

  const ids = await listDispatcherIdsForMonth(agentId, year, month);
  if (ids.length === 0) {
    console.log(`[prewarm-inline] ${agentId} ${year}-${month} ${reason}: no records`);
    return;
  }

  // Make status visible to the UI even on the inline path, so the indicator
  // behaves consistently between dev/prod.
  await createPrewarmJob({
    agentId,
    year,
    month,
    total: ids.length,
    totalChunks: 1,
    reason,
  });
  await updatePrewarmJob(agentId, year, month, {
    status: "running",
    stage: "generating",
  });

  try {
    const [pdfFiles, csvFiles] = await Promise.all([
      generateMonthDetailFiles({
        agentId,
        year,
        month,
        format: "pdf",
        dispatcherIds,
      }),
      generateMonthDetailFiles({
        agentId,
        year,
        month,
        format: "csv",
        dispatcherIds,
      }),
    ]);

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

    await incrementPrewarmDone(agentId, year, month, records.length);

    // Flip to "finalizing" so the UI shows "Bundling ZIP…" during the
    // two R2 uploads — otherwise it stalls visibly at 100% for the
    // duration of the zip stream.
    await updatePrewarmJob(agentId, year, month, { stage: "finalizing" });

    // Bulk ZIPs — always regenerated from the full month.
    if (dispatcherIds) {
      const allPdf = await generateMonthDetailFiles({ agentId, year, month, format: "pdf" });
      const allCsv = await generateMonthDetailFiles({ agentId, year, month, format: "csv" });
      await streamZipToR2(zipKey(agentId, year, month, "pdf"), allPdf);
      await streamZipToR2(zipKey(agentId, year, month, "csv"), allCsv);
    } else {
      await streamZipToR2(zipKey(agentId, year, month, "pdf"), pdfFiles);
      await streamZipToR2(zipKey(agentId, year, month, "csv"), csvFiles);
    }

    await updatePrewarmJob(agentId, year, month, {
      status: "done",
      stage: "done",
    });

    const ms = Date.now() - start;
    console.log(
      `[prewarm-inline] ${agentId} ${year}-${month} ${reason}: ${pdfFiles.length} PDF + ${csvFiles.length} CSV + 2 ZIP · ${ms}ms`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Prewarm inline failed";
    await updatePrewarmJob(agentId, year, month, {
      status: "failed",
      error: message,
    });
    throw err;
  }
}

// Kept as a named export for backward compatibility with the existing
// `/api/payroll-cache/prewarm` route. New callers should use
// `enqueuePrewarm` + the fan-out path.
export const runPrewarm = runPrewarmInline;
