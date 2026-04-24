import JSZip from "jszip";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKET } from "@/lib/r2";
import { getMonthDetailsBatch, type MonthDetail } from "@/lib/db/staff";
import { createNotification } from "@/lib/db/notifications";
import {
  buildTierBreakdown,
  type BonusTierSnapshotRow,
  type WeightTierSnapshot,
} from "./month-detail";
import { generateMonthDetailCsv } from "./month-detail-csv";
import { generateMonthDetailPdf } from "./month-detail-pdf";
import { monthDetailFilename } from "./month-detail-filename";
import { getJob, updateJob } from "./bulk-job";
import { readBonusTierSnapshot } from "./bonus-tier-snapshot";
import { runPool } from "@/lib/upload/run-pool";

/**
 * Run a bulk month-detail export in the background.
 * - Streams progress to the Redis job record so the UI can poll it.
 * - Uploads the final zip to R2 and stores the key on the job.
 * - Creates a Notification row so the bell lights up.
 *
 * Safe to call fire-and-forget — any error is captured onto the job.
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

    // 1. Batch-fetch every dispatcher's detail for the month in ONE round-trip.
    //    ~2 Prisma queries total (findMany + include → extra query for lineItems).
    const details = await getMonthDetailsBatch(job.agentId, job.year, job.month);

    if (details.length === 0) {
      await updateJob(jobId, {
        status: "failed",
        error: "No salary records for this month",
      });
      return;
    }

    await updateJob(jobId, { total: details.length, stage: "generating" });

    // 2. Generate files in a bounded pool. CSV is cheap (string join),
    //    PDF is CPU-bound so we keep concurrency low. PDF bumped 3→4 in
    //    phase 3 of the perf spec (33% faster on bulk exports; matches
    //    the payslip-bulk-worker pool). Benchmark against a 100-person
    //    export before going higher.
    const concurrency = job.format === "pdf" ? 4 : 8;
    let completed = 0;

    type GeneratedFile = { fileName: string; data: Uint8Array | string };
    const raw = await runPool<MonthDetail, GeneratedFile | null>(
      details,
      concurrency,
      async (detail) => {
        try {
          const weightTiers = ((detail.weightTiersSnapshot ?? []) as unknown) as WeightTierSnapshot[];
          const bonusTierSnapshot = readBonusTierSnapshot(detail.bonusTierSnapshot);
          const bonusTiers = (bonusTierSnapshot?.tiers ?? undefined) as BonusTierSnapshotRow[] | undefined;
          const tierBreakdown = buildTierBreakdown(detail.lineItems, weightTiers, bonusTiers);
          const fileName = monthDetailFilename(
            detail.year,
            detail.month,
            detail.dispatcher.name,
            job.format,
          );

          let data: Uint8Array | string;
          if (job.format === "csv") {
            data = generateMonthDetailCsv(detail, tierBreakdown);
          } else {
            const pdf = await generateMonthDetailPdf({
              dispatcher: {
                name: detail.dispatcher.name,
                extId: detail.dispatcher.extId,
                branchCode: detail.dispatcher.branchCode,
              },
              month: detail.month,
              year: detail.year,
              totals: detail.totals,
              orderThreshold: bonusTierSnapshot?.orderThreshold ?? 2000,
              tierBreakdown,
              lineItems: detail.lineItems.map((li) => ({
                deliveryDate: li.deliveryDate,
                waybillNumber: li.waybillNumber,
                weight: li.weight,
                isBonusTier: li.isBonusTier,
              })),
            });
            data = new Uint8Array(pdf);
          }

          completed++;
          // Throttled progress update — write every file OR every 2 for large jobs
          if (completed % 2 === 0 || completed === details.length) {
            await updateJob(jobId, { done: completed });
          }
          return { fileName, data };
        } catch (err) {
          console.error(
            `[bulk-export] skipping ${detail.dispatcher.extId}:`,
            err,
          );
          completed++;
          return null;
        }
      },
    );

    const files = raw.filter((f): f is GeneratedFile => f !== null);

    // 3. Build the zip in memory (still the cheapest option for 60-ish files)
    await updateJob(jobId, { stage: "zipping" });
    const zip = new JSZip();
    for (const f of files) {
      zip.file(f.fileName, f.data);
    }
    const zipBuffer = await zip.generateAsync({ type: "uint8array" });

    // 4. Upload to R2
    await updateJob(jobId, { stage: "uploading" });
    const mm = String(job.month).padStart(2, "0");
    const r2Key = `bulk-exports/${job.agentId}/${job.jobId}/${job.year}_${mm}_details.zip`;
    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: r2Key,
        Body: zipBuffer,
        ContentType: "application/zip",
      }),
    );

    // 5. Resolve branch name for the notification detail. We pick the most
    //    common branch across the records so agents with multiple branches
    //    still get a useful label.
    const branchCounts = new Map<string, number>();
    for (const d of details) {
      branchCounts.set(
        d.dispatcher.branchCode,
        (branchCounts.get(d.dispatcher.branchCode) ?? 0) + 1,
      );
    }
    const topBranch =
      [...branchCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

    // 6. Notify. Using the existing "payroll" notification type so the
    //    notification bell renders a known icon.
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
    }).catch(() => {}); // non-fatal

    await updateJob(jobId, {
      status: "done",
      stage: "done",
      done: files.length,
      total: details.length,
      r2Key,
    });
  } catch (err) {
    console.error(`[bulk-export] job ${jobId} failed:`, err);
    const message = err instanceof Error ? err.message : "Bulk export failed";
    await updateJob(jobId, { status: "failed", error: message });
  }
}

/**
 * Fire-and-forget dispatcher: in development we run the worker inline so
 * QStash localhost-loopback isn't a problem. In production we'd publish
 * to QStash the same way upload processing does. The dev call returns
 * before the work completes — state is tracked entirely via Redis.
 */
export function dispatchBulkExport(jobId: string): void {
  if (process.env.NODE_ENV !== "production") {
    Promise.resolve()
      .then(() => runBulkExport(jobId))
      .catch((e) => console.error("[bulk-export] dispatch failed:", e));
    return;
  }
  // Prod: awaiting on the caller's request is fine for now; for a truly
  // async prod path we'd publish to QStash here. Since QStash requires a
  // reachable URL and has a 15-minute invocation cap, this would need
  // either chunked work or an external queue.
  Promise.resolve()
    .then(() => runBulkExport(jobId))
    .catch((e) => console.error("[bulk-export] prod worker failed:", e));
}

