import { Client } from "@upstash/qstash";
import { streamZipToR2 } from "./streaming-zip";
import { getMonthDetailsBatch } from "@/lib/db/staff";
import { createNotification } from "@/lib/db/notifications";
import {
  getJob,
  updateJob,
  patchChunk,
  incrementChunksDone,
  incrementDoneCounter,
  seedChunksHash,
} from "./bulk-job";
import {
  generateMonthDetailFiles,
  listDispatcherIdsForMonth,
} from "./month-detail-files";
import { splitDispatchers, partR2Key } from "./bulk-chunks";
import { zipKey } from "./pdf-cache";

const qstash = new Client({ token: process.env.QSTASH_TOKEN ?? "" });

/**
 * Inline (single-worker) month-detail export — used by the dev path. One
 * process walks every dispatcher, streams the ZIP into R2, flips the job
 * to done. Safe to call fire-and-forget — errors captured onto the job.
 */
export async function runBulkExport(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) {
    console.error(`[bulk-export] job ${jobId} not found`);
    return;
  }

  try {
    await updateJob(jobId, {
      status: "running",
      stage: "fetching",
      startedAt: Date.now(),
    });

    // One DB round-trip for the initial size reveal — the full detail
    // fetch happens again inside generateMonthDetailFiles. Cheap because
    // the month-level query is well-indexed.
    const totalForStage = await listDispatcherIdsForMonth(
      job.agentId,
      job.year,
      job.month,
    );
    if (totalForStage.length === 0) {
      await updateJob(jobId, {
        status: "failed",
        error: "No salary records for this month",
      });
      return;
    }
    await updateJob(jobId, {
      total: totalForStage.length,
      stage: "generating",
    });

    const files = await generateMonthDetailFiles({
      agentId: job.agentId,
      year: job.year,
      month: job.month,
      format: job.format,
      onFile: async ({ dispatcherName, doneInBatch }) => {
        // Per-file progress write: carries `done` + `currentLabel` so the
        // Downloads Panel shows "Generating <name> · k / N". ~1 write/s
        // is fine at 60-person scale.
        await updateJob(jobId, {
          done: doneInBatch,
          currentLabel: dispatcherName,
        });
      },
    });

    // 3+4. Stream ZIP straight into R2 (Phase 3a) — peak RAM is a handful
    // of MB instead of the full archive size.
    //
    // Canonical cache key: shared across jobs for the same (agentId, year,
    // month, format). Subsequent `/bulk/start` calls short-circuit on this
    // blob instead of regenerating.
    await updateJob(jobId, { stage: "zipping" });
    const r2Key = zipKey(job.agentId, job.year, job.month, job.format);
    await updateJob(jobId, { stage: "uploading" });
    await streamZipToR2(r2Key, files);

    // Resolve a representative branch for the notification detail.
    const details = await getMonthDetailsBatch(job.agentId, job.year, job.month);
    const branchCounts = new Map<string, number>();
    for (const d of details) {
      branchCounts.set(
        d.dispatcher.branchCode,
        (branchCounts.get(d.dispatcher.branchCode) ?? 0) + 1,
      );
    }
    const topBranch =
      [...branchCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

    const monthName = new Date(job.year, job.month - 1).toLocaleString("en", {
      month: "long",
    });
    await createNotification({
      agentId: job.agentId,
      type: "payroll",
      message: `Bulk ${job.format.toUpperCase()} export ready`,
      detail: `${monthName} ${job.year} · ${files.length} dispatcher${
        files.length !== 1 ? "s" : ""
      }${topBranch ? ` · ${topBranch}` : ""}`,
    }).catch(() => {});

    await updateJob(jobId, {
      status: "done",
      stage: "done",
      done: files.length,
      total: totalForStage.length,
      r2Key,
    });
  } catch (err) {
    console.error(`[bulk-export] job ${jobId} failed:`, err);
    const message = err instanceof Error ? err.message : "Bulk export failed";
    await updateJob(jobId, { status: "failed", error: message });
  }
}

/**
 * Prod entry point: splits the month's dispatchers into chunks and
 * publishes one QStash message per chunk. The last chunk to finish
 * publishes a finalize message (see `/worker/chunk` handler).
 *
 * If QStash envs are missing or a chunk publish fails, we fall back to
 * running the inline worker so the export still completes.
 */
export async function startBulkExportFanout(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) {
    console.error(`[bulk-export-fanout] job ${jobId} not found`);
    return;
  }
  try {
    await updateJob(jobId, {
      status: "running",
      stage: "fetching",
      startedAt: Date.now(),
    });

    const ids = await listDispatcherIdsForMonth(job.agentId, job.year, job.month);
    if (ids.length === 0) {
      await updateJob(jobId, {
        status: "failed",
        error: "No salary records for this month",
      });
      return;
    }

    const chunks = splitDispatchers(ids);
    await seedChunksHash(jobId, chunks);
    await updateJob(jobId, {
      total: ids.length,
      totalChunks: chunks.length,
      completedChunks: 0,
      chunks,
      stage: "generating",
    });

    const workerUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/dispatchers/month-detail/bulk/worker/chunk`;
    await Promise.all(
      chunks.map((c) =>
        qstash.publishJSON({
          url: workerUrl,
          body: { jobId, chunkIndex: c.index },
          retries: 2,
        }),
      ),
    );
  } catch (err) {
    console.error(`[bulk-export-fanout] job ${jobId} failed to dispatch:`, err);
    // Fall back to inline so the export still completes.
    runBulkExport(jobId).catch((e) =>
      console.error(`[bulk-export-fanout] inline fallback failed:`, e),
    );
  }
}

/**
 * Fire-and-forget dispatcher.
 *   - Dev: run the inline worker on the local event loop (QStash can't
 *     reach localhost reliably).
 *   - Prod: fan out via QStash. If QStash envs aren't configured, fall
 *     back to the inline path so the feature still works.
 */
export function dispatchBulkExport(jobId: string): void {
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev || !process.env.QSTASH_TOKEN || !process.env.NEXT_PUBLIC_APP_URL) {
    Promise.resolve()
      .then(() => runBulkExport(jobId))
      .catch((e) => console.error("[bulk-export] dispatch failed:", e));
    return;
  }
  Promise.resolve()
    .then(() => startBulkExportFanout(jobId))
    .catch((e) => console.error("[bulk-export] fan-out failed:", e));
}

/**
 * Invoked by `/api/dispatchers/month-detail/bulk/worker/chunk` once QStash
 * delivers a chunk message. Generates files for this chunk's dispatcher
 * slice, streams them into a per-chunk part ZIP, and publishes the
 * finalize message if this was the last outstanding chunk.
 *
 * Idempotent — no-ops if the chunk is already `done`.
 */
export async function runBulkExportChunk(
  jobId: string,
  chunkIndex: number,
): Promise<void> {
  const job = await getJob(jobId);
  if (!job || !job.chunks) {
    console.error(`[bulk-export-chunk] job ${jobId} not found or has no chunks`);
    return;
  }
  const chunk = job.chunks[chunkIndex];
  if (!chunk) {
    console.error(`[bulk-export-chunk] chunk ${chunkIndex} not found on ${jobId}`);
    return;
  }
  // Idempotency — QStash retries are safe.
  if (chunk.status === "done") return;

  await patchChunk(jobId, chunkIndex, { status: "running" });

  try {
    const files = await generateMonthDetailFiles({
      agentId: job.agentId,
      year: job.year,
      month: job.month,
      format: job.format,
      dispatcherIds: chunk.dispatcherIds,
      onFile: async ({ dispatcherName }) => {
        // Atomic INCR via dedicated counter key (audit B1). `getJob`
        // merges the counter into `BulkJob.done` on read. `currentLabel`
        // writes are cosmetic and non-monotonic; last-writer-wins is fine.
        await incrementDoneCounter(jobId);
        await updateJob(jobId, { currentLabel: dispatcherName });
      },
    });

    const r2Key = partR2Key(job, chunkIndex);
    await streamZipToR2(r2Key, files);

    await patchChunk(jobId, chunkIndex, {
      status: "done",
      r2Key,
      fileCount: files.length,
    });

    // Atomic — exactly one chunk sees the return value === totalChunks.
    const done = await incrementChunksDone(jobId);
    if (done === job.totalChunks) {
      const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/dispatchers/month-detail/bulk/worker/finalize`;
      await qstash.publishJSON({ url, body: { jobId }, retries: 2 });
    }
  } catch (err) {
    console.error(
      `[bulk-export-chunk] job ${jobId} chunk ${chunkIndex} failed:`,
      err,
    );
    const message = err instanceof Error ? err.message : "Chunk worker failed";
    await patchChunk(jobId, chunkIndex, { status: "failed", error: message });
    // Failed chunks still count toward "all chunks terminal" — finalize
    // handles partial success (some chunks done, some failed) by archiving
    // whatever parts exist.
    const done = await incrementChunksDone(jobId);
    if (done === job.totalChunks) {
      try {
        const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/dispatchers/month-detail/bulk/worker/finalize`;
        await qstash.publishJSON({ url, body: { jobId }, retries: 2 });
      } catch (pubErr) {
        console.error(
          `[bulk-export-chunk] failed to publish finalize:`,
          pubErr,
        );
      }
    }
  }
}
