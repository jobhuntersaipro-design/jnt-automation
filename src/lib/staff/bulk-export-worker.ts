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

// Surface obvious prod misconfigs at boot so a stuck export traces back to
// the missing env var instead of silently dropping QStash messages. Logs
// once per cold start; harmless in dev (we use the inline path there).
if (process.env.NODE_ENV === "production") {
  const missing: string[] = [];
  if (!process.env.QSTASH_TOKEN) missing.push("QSTASH_TOKEN");
  if (!process.env.QSTASH_CURRENT_SIGNING_KEY) missing.push("QSTASH_CURRENT_SIGNING_KEY");
  if (!process.env.QSTASH_NEXT_SIGNING_KEY) missing.push("QSTASH_NEXT_SIGNING_KEY");
  if (!process.env.NEXT_PUBLIC_APP_URL) missing.push("NEXT_PUBLIC_APP_URL");
  if (missing.length > 0) {
    console.warn(
      `[bulk-export] PROD env vars missing — QStash fan-out will fall back to inline (which will hit Vercel function timeout on big exports): ${missing.join(", ")}`,
    );
  } else if (process.env.NEXT_PUBLIC_APP_URL?.includes("localhost")) {
    console.warn(
      `[bulk-export] PROD NEXT_PUBLIC_APP_URL points to localhost — QStash cannot reach the worker. Value: ${process.env.NEXT_PUBLIC_APP_URL}`,
    );
  }
}

// Surface fire-and-forget worker crashes that escape the try/catch inside
// runBulkExport — for example, a synchronous throw in module init or a
// rejection from a stray Promise that wasn't awaited. Without this, the
// rejection lands on Node's default handler (silent in Next dev) and the
// worker just disappears mid-run, leaving the Redis job stuck on whatever
// stage it was on. Installed once per process.
declare global {
  // eslint-disable-next-line no-var
  var __bulkExportRejectionHandlerInstalled: boolean | undefined;
}
if (!globalThis.__bulkExportRejectionHandlerInstalled) {
  process.on("unhandledRejection", (reason) => {
    const msg = reason instanceof Error ? reason.stack ?? reason.message : String(reason);
    if (msg.includes("bulk-export") || msg.includes("month-detail") || msg.includes("streamZipToR2")) {
      console.error("[bulk-export] unhandledRejection in worker:", msg);
    }
  });
  globalThis.__bulkExportRejectionHandlerInstalled = true;
}

/**
 * Inline (single-worker) month-detail export — used by the dev path. One
 * process walks every dispatcher, streams the ZIP into R2, flips the job
 * to done. Safe to call fire-and-forget — errors captured onto the job.
 */
export async function runBulkExport(jobId: string): Promise<void> {
  const t0 = Date.now();
  const log = (msg: string) =>
    console.log(`[bulk-export:${jobId.slice(0, 8)}] +${((Date.now() - t0) / 1000).toFixed(1)}s ${msg}`);

  const job = await getJob(jobId);
  if (!job) {
    console.error(`[bulk-export] job ${jobId} not found`);
    return;
  }
  log(`started (agent=${job.agentId.slice(0, 8)} ${job.year}-${job.month} ${job.format})`);

  try {
    await updateJob(jobId, {
      status: "running",
      stage: "fetching",
      startedAt: Date.now(),
    });
    log("stage=fetching");

    const totalForStage = await listDispatcherIdsForMonth(
      job.agentId,
      job.year,
      job.month,
    );
    log(`fetched ${totalForStage.length} dispatcher ids`);
    if (totalForStage.length === 0) {
      await updateJob(jobId, {
        status: "failed",
        error: "No salary records for this month",
      });
      log("failed — no salary records");
      return;
    }
    await updateJob(jobId, {
      total: totalForStage.length,
      stage: "generating",
    });
    log("stage=generating");

    const files = await generateMonthDetailFiles({
      agentId: job.agentId,
      year: job.year,
      month: job.month,
      format: job.format,
      onFile: async ({ dispatcherName, doneInBatch }) => {
        await updateJob(jobId, {
          done: doneInBatch,
          currentLabel: dispatcherName,
        });
      },
    });
    log(`generated ${files.length} files`);

    await updateJob(jobId, { stage: "zipping" });
    log("stage=zipping");
    const r2Key = zipKey(job.agentId, job.year, job.month, job.format);
    await updateJob(jobId, { stage: "uploading" });
    log(`stage=uploading → r2://${r2Key}`);
    await streamZipToR2(r2Key, files);
    log("zip uploaded");

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
    log(`DONE ${files.length} files in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (err) {
    console.error(`[bulk-export:${jobId.slice(0, 8)}] FAILED after ${((Date.now() - t0) / 1000).toFixed(1)}s:`, err);
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
    console.log(
      `[bulk-export-fanout] ${jobId.slice(0, 8)} publishing ${chunks.length} chunk(s) to ${workerUrl}`,
    );

    // allSettled — partial publish failures must not silently lose chunks.
    // Promise.all bails on the first rejection and the remaining publishes
    // never happen, but `totalChunks=N` is already on the Redis record so
    // the job sits forever waiting for chunks that were never sent.
    const results = await Promise.allSettled(
      chunks.map((c) =>
        qstash.publishJSON({
          url: workerUrl,
          body: { jobId, chunkIndex: c.index },
          retries: 2,
        }),
      ),
    );

    const failed: Array<{ chunkIndex: number; error: string }> = [];
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        failed.push({ chunkIndex: i, error: msg });
        console.error(
          `[bulk-export-fanout] ${jobId.slice(0, 8)} chunk ${i} publish failed:`,
          msg,
        );
      }
    });
    console.log(
      `[bulk-export-fanout] ${jobId.slice(0, 8)} publish summary: ${results.length - failed.length}/${results.length} succeeded`,
    );
    if (failed.length === results.length) {
      // Every publish failed — flip the job so the user sees a real error
      // instead of an indefinite spinner. Most likely cause: bad QStash
      // token, wrong NEXT_PUBLIC_APP_URL, or QStash outage.
      await updateJob(jobId, {
        status: "failed",
        error: `All ${results.length} QStash publishes failed. First error: ${failed[0]?.error ?? "unknown"}`,
      });
    } else if (failed.length > 0) {
      // Partial — the job will still finalize because finalize triggers on
      // "all chunks terminal" and unpublished chunks stay `pending` forever
      // BUT incrementChunksDone never reaches totalChunks. We have to mark
      // those slots failed in the chunks hash so `incrementChunksDone` can
      // catch up via finalize-on-all-terminal logic. Cheaper: just fail the
      // job — partial output isn't useful and the user can retry.
      await updateJob(jobId, {
        status: "failed",
        error: `${failed.length}/${results.length} QStash publishes failed. First error: ${failed[0]?.error ?? "unknown"}`,
      });
    }
  } catch (err) {
    console.error(`[bulk-export-fanout] job ${jobId} failed to dispatch:`, err);
    // Fall back to inline so the export still completes.
    runBulkExport(jobId).catch((e) =>
      console.error(`[bulk-export-fanout] inline fallback failed:`, e),
    );
  }
}

/**
 * Awaitable dispatcher.
 *   - Dev: run the inline worker on the local event loop (QStash can't
 *     reach localhost reliably).
 *   - Prod: fan out via QStash. If QStash envs aren't configured, fall
 *     back to the inline path so the feature still works.
 *
 * Callers (the start route) wrap this in `after()` so Vercel keeps the
 * function alive until publish completes. Returning a Promise lets the
 * call site observe the actual outcome instead of swallowing it on a
 * detached fire-and-forget chain.
 */
export async function runDispatchBulkExport(jobId: string): Promise<void> {
  const isDev = process.env.NODE_ENV !== "production";
  const useInline =
    isDev || !process.env.QSTASH_TOKEN || !process.env.NEXT_PUBLIC_APP_URL;
  console.log(
    `[bulk-export] dispatching ${jobId.slice(0, 8)} via ${useInline ? "inline" : "qstash-fanout"}` +
      (!isDev
        ? ` (qstashToken=${process.env.QSTASH_TOKEN ? "set" : "MISSING"} appUrl=${process.env.NEXT_PUBLIC_APP_URL ? "set" : "MISSING"} signingKey=${process.env.QSTASH_CURRENT_SIGNING_KEY ? "set" : "MISSING"})`
        : ""),
  );
  if (useInline) {
    await runBulkExport(jobId);
    return;
  }
  await startBulkExportFanout(jobId);
}

/**
 * @deprecated Use `runDispatchBulkExport` wrapped in `after()` from
 * the route handler. Kept as a thin shim so any remaining caller still
 * works, but it WILL race with Vercel function termination in prod.
 */
export function dispatchBulkExport(jobId: string): void {
  Promise.resolve()
    .then(() => runDispatchBulkExport(jobId))
    .catch((e) =>
      console.error(
        `[bulk-export] dispatchBulkExport crashed for ${jobId.slice(0, 8)}:`,
        e,
      ),
    );
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
