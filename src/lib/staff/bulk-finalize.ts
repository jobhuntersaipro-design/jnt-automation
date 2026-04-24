import archiver from "archiver";
import yauzl from "yauzl";
import { PassThrough, Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { r2, R2_BUCKET } from "@/lib/r2";
import { getJob, updateJob } from "./bulk-job";
import { getMonthDetailsBatch } from "@/lib/db/staff";
import { createNotification } from "@/lib/db/notifications";

/**
 * Finalize worker — merges all per-chunk part ZIPs into one final archive
 * at the job's canonical R2 key, cleans up the parts, flips the job done.
 *
 * Idempotent: returns immediately if the job is already terminal.
 *
 * Implementation: for each part ZIP, we open it via yauzl (streaming ZIP
 * reader), pipe each entry through archiver into the final archive, which
 * is itself streamed via PassThrough → lib-storage Upload. No temp files,
 * no full-buffer in memory.
 */
export async function finalizeBulkExport(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) {
    console.error(`[bulk-finalize] job ${jobId} not found`);
    return;
  }
  if (job.status === "done" || job.status === "failed") {
    return; // idempotent — already resolved
  }
  if (!job.chunks || job.chunks.length === 0) {
    await updateJob(jobId, { status: "failed", error: "No chunks to finalize" });
    return;
  }

  try {
    await updateJob(jobId, { stage: "zipping" });

    const partKeys: string[] = job.chunks
      .filter((c) => c.status === "done" && c.r2Key)
      .map((c) => c.r2Key!)
      // process in chunk order so output file order matches input order
      .sort();

    if (partKeys.length === 0) {
      await updateJob(jobId, {
        status: "failed",
        error: "All chunks failed — nothing to archive",
      });
      return;
    }

    const mm = String(job.month).padStart(2, "0");
    const finalKey = `bulk-exports/${job.agentId}/${job.jobId}/${job.year}_${mm}_details.zip`;

    // Open the output archive: archiver → PassThrough → lib-storage Upload.
    // Level 1 zlib — entries are already compressed (PDFs), so minimal
    // compression keeps CPU low and output size only slightly larger.
    const archive = archiver("zip", { zlib: { level: 1 } });
    const passthrough = new PassThrough();
    archive.pipe(passthrough);

    const upload = new Upload({
      client: r2,
      params: {
        Bucket: R2_BUCKET,
        Key: finalKey,
        Body: passthrough,
        ContentType: "application/zip",
      },
      queueSize: 2,
    });
    archive.on("error", (err) => passthrough.destroy(err));

    await updateJob(jobId, { stage: "uploading" });

    // For each part, stream all its entries into the final archive. Runs
    // sequentially — archiver doesn't support concurrent writes.
    let totalFiles = 0;
    for (const partKey of partKeys) {
      const entries = await extractEntriesFromR2(partKey);
      for (const entry of entries) {
        archive.append(entry.buffer, { name: entry.fileName });
        totalFiles++;
      }
    }

    await archive.finalize();
    await upload.done();

    // Clean up part ZIPs. Non-fatal — the 30-day R2 lifecycle rule is the
    // safety net if this loop errors partway.
    await Promise.all(
      partKeys.map((key) =>
        r2
          .send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }))
          .catch((err) =>
            console.error(`[bulk-finalize] failed to delete ${key}:`, err),
          ),
      ),
    );

    // Notification: same format as the inline path.
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
      detail: `${monthName} ${job.year} · ${totalFiles} dispatcher${
        totalFiles !== 1 ? "s" : ""
      }${topBranch ? ` · ${topBranch}` : ""}`,
    }).catch(() => {});

    await updateJob(jobId, {
      status: "done",
      stage: "done",
      done: totalFiles,
      r2Key: finalKey,
    });
  } catch (err) {
    console.error(`[bulk-finalize] job ${jobId} failed:`, err);
    const message = err instanceof Error ? err.message : "Finalize failed";
    await updateJob(jobId, { status: "failed", error: message });
  }
}

/**
 * Pull a part ZIP from R2 and extract its entries as in-memory buffers.
 *
 * Note: for now we buffer each part fully before re-archiving. A fully
 * streaming merge would require plumbing yauzl's entry streams through
 * archiver — doable, but adds complexity. Since part ZIPs are at most
 * `CHUNK_SIZE × ~500KB` (15 × 500KB = ~7.5 MB), buffering is fine.
 */
async function extractEntriesFromR2(
  key: string,
): Promise<{ fileName: string; buffer: Buffer }[]> {
  const obj = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  if (!obj.Body) return [];

  const body = obj.Body as Readable;
  const buf = await streamToBuffer(body);

  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err ?? new Error("zipfile null"));
      const entries: { fileName: string; buffer: Buffer }[] = [];
      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        // Skip directories
        if (/\/$/.test(entry.fileName)) {
          zipfile.readEntry();
          return;
        }
        zipfile.openReadStream(entry, (err2, stream) => {
          if (err2 || !stream) return reject(err2 ?? new Error("stream null"));
          streamToBuffer(stream)
            .then((b) => {
              entries.push({ fileName: entry.fileName, buffer: b });
              zipfile.readEntry();
            })
            .catch(reject);
        });
      });
      zipfile.on("end", () => resolve(entries));
      zipfile.on("error", reject);
    });
  });
}

function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}
